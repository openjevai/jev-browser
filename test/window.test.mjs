// Opt-in real desktop regression; never operates on the user's existing Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../dist/navigate.js';
import { fixture, configure, decision, livePage } from './helpers.mjs';

test('visible Chrome viewport grows and shrinks with its native window', { skip: process.env.JEV_TEST_HEADED !== '1' }, async t => {
  const previous = process.env.JEV_BROWSER_HEADED;
  process.env.JEV_BROWSER_HEADED = '1';
  const f = await fixture(body => decision(body)); configure(f.origin);
  const manager = new SessionManager();
  t.after(async () => {
    await manager.shutdown(); await f.close();
    if (previous === undefined) delete process.env.JEV_BROWSER_HEADED; else process.env.JEV_BROWSER_HEADED = previous;
  });
  const first = await manager.navigate({ task: 'Local window sizing test', startUrl: f.origin, screenshot: 'none' });
  assert.equal(first.status, 'done');
  const page = livePage(manager, first.session_id);
  assert.equal(page.viewportSize(), null);
  await page.setContent('<style>html,body{margin:0;width:100%;height:100%}#surface{width:100vw;height:100vh;background:#dbeafe}</style><div id="surface"></div>');
  const cdp = await page.context().newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  async function resize(width, height) {
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width, height } });
    await page.waitForFunction(({ width, height }) => Math.abs(window.outerWidth - width) < 30 && Math.abs(window.outerHeight - height) < 30, { width, height });
    await page.waitForFunction(() => Math.abs(window.innerWidth - window.outerWidth) < 30);
    return page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      surfaceWidth: document.querySelector('#surface').getBoundingClientRect().width,
      surfaceHeight: document.querySelector('#surface').getBoundingClientRect().height }));
  }
  const small = await resize(1000, 750);
  const large = await resize(1300, 950);
  assert.ok(large.width - small.width > 200, JSON.stringify({ small, large }));
  assert.ok(large.height - small.height > 120, JSON.stringify({ small, large }));
  assert.equal(large.surfaceWidth, large.width); assert.equal(large.surfaceHeight, large.height);
  const shrunk = await resize(1000, 750);
  assert.ok(large.width - shrunk.width > 200);
  console.log('Window content dimensions:', JSON.stringify({ small, large, shrunk }));
  const reused = await manager.navigate({ task: 'Next batch item', startUrl: f.origin, screenshot: 'none' });
  assert.equal(reused.session_id, first.session_id);
  assert.equal(livePage(manager, reused.session_id).viewportSize(), null);
  await cdp.detach();
});
