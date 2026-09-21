import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { SessionManager, navigate } from '../dist/navigate.js';
import { fixture, configure, decision, match, livePage } from './helpers.mjs';
async function setup(t, handler, options) {
  const f = await fixture(handler); configure(f.origin);
  const manager = new SessionManager(options);
  t.after(async () => { await manager.shutdown(); await f.close(); });
  return { f, manager, start: extra => manager.navigate({ task: 'Test', startUrl: f.origin, screenshot: 'none', ...extra }) };
}
const choose = (prefix, label = '') => body => decision(body, c => match(c, prefix, label));

test('click navigation, read without inference, same-context subtask, close', async t => {
  let n = 0;
  const { f, manager, start } = await setup(t, body => ++n === 1 ? decision(body, c => match(c, 'click_', 'Next article')) : decision(body));
  const r = await start(); assert.equal(r.status, 'done'); assert.match(r.final_url, /\/next$/);
  const page = livePage(manager, r.session_id);
  await page.evaluate(() => { document.cookie = 'test=yes'; window.marker = 'retained'; });
  const before = f.calls.length;
  assert.match((await manager.read(r.session_id)).page.content, /Final article/);
  assert.equal(f.calls.length, before);
  const c = await manager.continue(r.session_id, { task: 'Read this page' });
  assert.equal(c.status, 'done'); assert.notEqual(c.task_id, r.task_id);
  assert.equal(await page.evaluate(() => window.marker), 'retained');
  assert.match(await page.evaluate(() => document.cookie), /test=yes/);
  assert.equal((await manager.close(r.session_id)).status, 'closed');
  assert.equal((await manager.read(r.session_id)).code, 'session_expired');
});
test('search uses host text, pauses without losing budget, concurrent retries execute once', async t => {
  const { f, manager, start } = await setup(t, body => body.state.current_page.url.includes('/result') ? decision(body) : decision(body, c => match(c, 'search_')));
  const originalFetch = globalThis.fetch;
  const modelUrls = [];
  globalThis.fetch = (url, options) => {
    modelUrls.push(String(url));
    assert.equal(String(url), f.origin + '/api/decisions', 'an extra model endpoint was called');
    return originalFetch(url, options);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  process.env.OPENROUTER_API_KEY = 'sk-or-unused-must-never-call-model';
  process.env.OPENAI_API_KEY = 'sk-unused-must-never-call-model';
  process.env.JEV_BROWSER_TYPE_BASE_URL = 'http://127.0.0.1:1/forbidden';
  t.after(() => { delete process.env.OPENROUTER_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.JEV_BROWSER_TYPE_BASE_URL; });
  const first = await start(); assert.equal(first.status, 'needs_input');
  assert.equal(first.pending_action.submits_after_fill, true);
  await delay(120);
  const text = '  "Ristretto 咖啡"  ';
  const [a, b] = await Promise.all([
    manager.resume(first.session_id, first.request_id, text),
    manager.resume(first.session_id, first.request_id, text),
  ]);
  assert.equal(a.status, 'done'); assert.deepEqual(a, b);
  assert.equal(f.submissions.length, 1);
  assert.equal(new URL(a.final_url).searchParams.get('q'), text);
  assert.ok(a.usage.jev_calls >= 2); assert.equal(a.usage.est_cost_usd, null);
  assert.ok(f.calls.every(c => c.url === '/api/decisions' && c.body.model === 'jev-latest'));
  assert.equal(modelUrls.length, f.calls.length);
});
test('multiple fields preserve exact whitespace and do not submit early', async t => {
  let n = 0;
  const { f, manager, start } = await setup(t, body => {
    n++;
    return decision(body, c => n === 1 ? match(c, 'type_', 'Full name') : n === 2 ? match(c, 'type_', 'Message') : 'done');
  });
  const r = await start();
  const s = await manager.resume(r.session_id, r.request_id, '  Ada  ');
  assert.equal(s.status, 'needs_input');
  const final = await manager.resume(s.session_id, s.request_id, 'Hello\n"World"\n');
  assert.equal(final.status, 'done'); assert.equal(f.submissions.length, 0);
  const page = livePage(manager, r.session_id);
  assert.equal(await page.locator('[name=name]').inputValue(), '  Ada  ');
  assert.equal(await page.locator('[name=message]').inputValue(), 'Hello\n"World"\n');
});
test('DOM replacement and navigation discard stale host text and issue fresh requests', async t => {
  const { f, manager, start } = await setup(t, choose('type_', 'Full name'));
  const r = await start(); const page = livePage(manager, r.session_id);
  await page.locator('[name=name]').evaluate(el => el.replaceWith(el.cloneNode(true)));
  const s = await manager.resume(r.session_id, r.request_id, 'MUST NOT LAND');
  assert.equal(s.status, 'needs_input'); assert.notEqual(s.request_id, r.request_id);
  assert.equal(await page.locator('[name=name]').inputValue(), '');
  await page.goto(f.origin + '/?newpage');
  const p = await manager.resume(s.session_id, s.request_id, 'MUST NOT LAND');
  assert.equal(p.status, 'needs_input'); assert.notEqual(p.request_id, s.request_id);
  assert.equal(await page.locator('[name=name]').inputValue(), '');
});
test('native select keeps DOM index, new tab is adopted', async t => {
  let n = 0;
  const { manager, start } = await setup(t, body => {
    if (body.questions.option) return decision(body, 'o1');
    n++; return n === 1 ? decision(body, c => match(c, 'select_')) : decision(body);
  });
  const r = await start(); assert.equal(r.status, 'done');
  const page = livePage(manager, r.session_id);
  assert.equal(await page.locator('select').inputValue(), 'Business');
  // The extractor deduplicates equal destinations, so make the popup destination distinct.
  await page.locator('a[target=_blank]').evaluate(el => el.href += '?popup');
  const session = manager.sessions.get(r.session_id);
  // Change the fixture model to select the popup for a new subtask.
  // Accessing the real browser here tests the state retained across host calls.
  await page.evaluate(() => window.open('/next', '_blank'));
  await delay(200);
  const next = await manager.continue(r.session_id, { task: 'Read popup' });
  assert.match(next.final_url, /\/next$/); assert.notEqual(session.page, page);
});
test('password source stays separate, echoed secrets are redacted, screenshots suppressed', async t => {
  let n = 0;
  const { f, manager, start } = await setup(t, body => ++n === 1 ? decision(body, c => match(c, 'fill_password_')) : decision(body));
  const secret = 's3cret-long-value';
  const r = await start({ password: { value: secret, origin: f.origin }, screenshot: 'final' });
  assert.equal(r.status, 'done'); assert.equal(r.password_filled, true);
  assert.equal(r.screenshot_suppressed, 'credential-fill');
  assert.ok(!JSON.stringify(r).includes(secret)); assert.ok(!JSON.stringify(f.calls).includes(secret));
  const read = await manager.read(r.session_id, { format: 'aria', screenshot: 'final' });
  assert.equal(read.screenshot_suppressed, 'credential-fill'); assert.ok(!JSON.stringify(read).includes(secret));
});
test('password origin mismatch prevents fill', async t => {
  const { manager, start } = await setup(t, choose('fill_password_'));
  const r = await start({ maxSteps: 1, password: { value: 's3cret-long-value', origin: 'https://example.com' } });
  assert.equal(r.steps[0].action_error, 'origin_mismatch');
  assert.equal(await livePage(manager, r.session_id).locator('[type=password]').inputValue(), '');
});
test('step budget survives resume; only explicit new task resets it', async t => {
  const { manager, start } = await setup(t, choose('type_', 'Full name'));
  const r = await start({ maxSteps: 1 });
  const done = await manager.resume(r.session_id, r.request_id, 'Ada');
  assert.equal(done.status, 'max_steps');
  assert.equal((await manager.continue(r.session_id)).status, 'max_steps');
  await assert.rejects(manager.continue(r.session_id, { maxSteps: 99 }), /new task/);
  assert.equal((await manager.continue(r.session_id, { task: 'New task' })).status, 'needs_input');
});
test('idle expiry and capacity limits release resources', async t => {
  const { manager, start } = await setup(t, body => decision(body), { maxSessions: 1, idleMs: 150 });
  const r = await start(); const page = livePage(manager, r.session_id);
  assert.equal((await start({ newInstance: true })).code, 'session_limit');
  await delay(350);
  assert.equal((await manager.read(r.session_id)).code, 'session_expired'); assert.equal(page.isClosed(), true);
  assert.equal((await start()).status, 'done');
});
test('slice timeout during inference is resumable; active task budget is cumulative', async t => {
  const { f, manager, start } = await setup(t, body => decision(body));
  const r = await start();
  manager.sessions.get(r.session_id).turnMs = 200;
  f.setHandler(async body => { await delay(450); return decision(body); });
  const paused = await manager.continue(r.session_id, { task: 'Wait for decisions', maxSeconds: 1 });
  assert.equal(paused.status, 'paused'); assert.equal(paused.session_closed, false);
  let final = paused;
  for (let i = 0; i < 8 && final.status === 'paused'; i++) final = await manager.continue(r.session_id);
  assert.equal(final.status, 'timeout');
});
test('cancellation closes active browser; malformed decisions execute nothing', async t => {
  const { f, manager, start } = await setup(t, body => decision(body));
  const r = await start(); const page = livePage(manager, r.session_id);
  f.setHandler(async body => { await delay(500); return decision(body); });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 80);
  const result = await manager.continue(r.session_id, { task: 'Cancelled task' }, controller.signal);
  assert.equal(result.code, 'cancelled'); assert.equal(page.isClosed(), true);
  f.setHandler(body => decision(body, 'nonexistent-action'));
  const bad = await start(); assert.equal(bad.status, 'error'); assert.equal(bad.steps.length, 0);
});
test('one-shot library closes missing-input sessions; callback supplies host text', async t => {
  const f = await fixture(body => body.state.current_page.url.includes('/result') ? decision(body) : decision(body, c => match(c, 'search_')));
  configure(f.origin); t.after(() => f.close());
  const r = await navigate({ task: 'Search', startUrl: f.origin, screenshot: 'none' });
  assert.equal(r.status, 'needs_input'); assert.equal(r.session_closed, true); assert.match(r.message, /cannot be resumed/);
  const done = await navigate({ task: 'Search', startUrl: f.origin, screenshot: 'none', textProvider: () => 'from host callback' });
  assert.equal(done.status, 'done'); assert.equal(done.session_closed, true);
  assert.equal(new URL(done.final_url).searchParams.get('q'), 'from host callback');
});

test('typing disabled removes text choices; explicit submit remains a Jev decision', async t => {
  const { f, manager, start } = await setup(t, body => decision(body));
  const r = await start({ allowTyping: false });
  assert.ok(Object.keys(f.calls[0].body.questions.action.criteria).every(k => !/^(type_|search_|fill_password_)/.test(k)));
  let n = 0;
  f.setHandler(body => decision(body, c => ++n === 1 ? match(c, 'submit_', 'Send form') : 'done'));
  const sent = await manager.continue(r.session_id, { task: 'Submit this empty form' });
  assert.equal(sent.status, 'done'); assert.equal(f.submissions.length, 1);
  assert.match(sent.steps.at(-2).executed_action, /^submit_/);
});
test('Jev-driven popup adopts the new tab and returns an image', async t => {
  const { f, manager, start } = await setup(t, body => decision(body));
  const initial = await start();
  const page = livePage(manager, initial.session_id);
  await page.locator('a[target=_blank]').evaluate(el => el.href += '?popup');
  let n = 0;
  f.setHandler(body => decision(body, c => ++n === 1 ? match(c, 'click_', 'New tab') : 'done'));
  const r = await manager.continue(initial.session_id, { task: 'Open New tab' });
  assert.equal(r.status, 'done'); assert.match(r.final_url, /\/next\?popup$/);
  assert.notEqual(livePage(manager, r.session_id), page);
  const image = await manager.read(r.session_id, { screenshot: 'final' });
  assert.equal(Buffer.from(image.screenshot_base64_jpeg, 'base64').subarray(0, 2).toString('hex'), 'ffd8');
});
test('waiting for host text does not spend task execution budget', async t => {
  const { manager, start } = await setup(t, choose('type_', 'Full name'));
  const r = await start(); const session = manager.sessions.get(r.session_id);
  const active = session.activeMs;
  await delay(250);
  assert.equal(session.activeMs, active);
  const read = await manager.read(r.session_id);
  assert.equal(read.status, 'needs_input'); assert.equal(session.activeMs, active);
});
test('semantic field change to password rejects ordinary host text', async t => {
  const { f, manager, start } = await setup(t, choose('type_', 'Full name'));
  const r = await start(); const page = livePage(manager, r.session_id);
  await page.locator('[name=name]').evaluate(el => { el.type = 'password'; });
  f.setHandler(body => decision(body));
  const result = await manager.resume(r.session_id, r.request_id, 'not-a-password');
  assert.equal(result.status, 'done');
  assert.equal(await page.locator('[name=name]').inputValue(), '');
  assert.match(result.message, /discarded/);
});

test('already-cancelled call never launches or infers; shutdown rejects new sessions', async t => {
  const { f, manager } = await setup(t, body => decision(body));
  const controller = new AbortController(); controller.abort();
  const result = await manager.navigate({ task: 'Cancelled', startUrl: f.origin }, controller.signal);
  assert.equal(result.code, 'cancelled'); assert.equal(result.session_closed, true); assert.equal(f.calls.length, 0);
  await manager.shutdown();
  await assert.rejects(manager.navigate({ task: 'New', startUrl: f.origin }), /stopped/);
});

test('a focus handler changing the input type cannot bypass resume validation', async t => {
  const { f, manager, start } = await setup(t, choose('type_', 'Full name'));
  const r = await start(); const page = livePage(manager, r.session_id);
  await page.locator('[name=name]').evaluate(el => { el.onfocus = () => { el.type = 'password'; }; });
  f.setHandler(body => decision(body));
  const result = await manager.resume(r.session_id, r.request_id, 'must-not-land');
  assert.equal(result.status, 'done');
  assert.equal(await page.locator('[name=name]').inputValue(), '');
  assert.match(result.steps[0].action_error, /discarded/);
});

test('batch navigation reuses the same browser, context and working tab', async t => {
  const { f, manager, start } = await setup(t, body => decision(body));
  const first = await start(); const session = manager.sessions.get(first.session_id);
  const browser = session.browser, context = session.context, page = session.page;
  await page.evaluate(() => { document.cookie = 'batch=yes'; });
  await page.evaluate(() => window.open('/next', '_blank'));
  await delay(150);
  const second = await start({ task: 'Next batch item', startUrl: f.origin + '/next' });
  assert.equal(second.session_id, first.session_id); assert.notEqual(second.task_id, first.task_id);
  assert.equal(session.browser, browser); assert.equal(session.context, context); assert.equal(session.page, page);
  assert.equal(context.pages().length, 1); assert.equal(manager.sessions.size, 1);
  assert.match(await page.evaluate(() => document.cookie), /batch=yes/);
  assert.match(second.final_url, /\/next$/);
});
test('concurrent batch starts reserve one browser and execute in order', async t => {
  const { f, manager, start } = await setup(t, async body => { await delay(50); return decision(body); });
  const results = await Promise.all([start({ task: 'First' }), start({ task: 'Second' }), start({ task: 'Third' })]);
  assert.ok(results.every(r => r.status === 'done'));
  assert.equal(new Set(results.map(r => r.session_id)).size, 1);
  assert.equal(manager.sessions.size, 1);
  assert.deepEqual(f.calls.map(c => c.body.state.task), ['First', 'Second', 'Third']);
});
test('unfinished input is not overwritten by another default navigation', async t => {
  const { manager, start } = await setup(t, choose('type_', 'Full name'));
  const first = await start(); const page = livePage(manager, first.session_id);
  const second = await start({ task: 'Unrelated task' });
  assert.equal(second.code, 'session_in_use'); assert.equal(second.session_id, first.session_id);
  assert.equal(second.request_id, first.request_id); assert.equal(manager.sessions.size, 1);
  const read = await manager.read(first.session_id);
  assert.equal(read.status, 'needs_input'); assert.equal(read.request_id, first.request_id);
  assert.equal(await page.locator('[name=name]').inputValue(), '');
});
test('only explicit newInstance creates another browser; closing it leaves default intact', async t => {
  const { manager, start } = await setup(t, body => decision(body));
  const first = await start(); const a = manager.sessions.get(first.session_id);
  const second = await start({ newInstance: true }); const b = manager.sessions.get(second.session_id);
  assert.notEqual(a.browser, b.browser); assert.equal(manager.sessions.size, 2);
  await manager.close(second.session_id);
  assert.equal(a.browser.isConnected(), true);
  const third = await start(); assert.equal(third.session_id, first.session_id);
  await manager.close(first.session_id);
  const fourth = await start(); assert.notEqual(fourth.session_id, first.session_id);
});
test('changing credential boundaries requires closing rather than silently spawning', async t => {
  const { f, manager, start } = await setup(t, body => decision(body));
  const first = await start();
  const second = await start({ password: { value: 'new-secret-value', origin: f.origin } });
  assert.equal(second.code, 'session_options_conflict'); assert.equal(manager.sessions.size, 1);
  assert.equal(manager.sessions.get(first.session_id).browser.isConnected(), true);
});
