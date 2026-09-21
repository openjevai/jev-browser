import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixture, decision, match, KEY } from './helpers.mjs';
const entry = new URL('../scripts/start.mjs', import.meta.url).pathname;
const wrapper = new URL(process.platform === 'win32' ? '../scripts/start.cmd' : '../scripts/start.sh', import.meta.url).pathname;
const names = ['jev_close', 'jev_continue', 'jev_navigate', 'jev_read', 'jev_resume'];
const json = r => JSON.parse(r.content.find(c => c.type === 'text').text);
function env(f) { return { ...process.env, JEV_API_URL: f.origin + '/api/decisions', JEV_API_KEY: KEY }; }
async function connect(f) {
  const transport = new StdioClientTransport({ command: process.platform === 'win32' ? 'cmd.exe' : 'sh', args: process.platform === 'win32' ? ['/d', '/c', wrapper] : [wrapper], env: env(f), stderr: 'pipe' });
  const client = new Client({ name: 'host-agent-test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport); return { client, transport };
}

test('stdio handshake, discovery, host text round trip and process cleanup', async () => {
  const f = await fixture(body => body.state.current_page.url.includes('/result') ? decision(body) : decision(body, c => match(c, 'search_')));
  const { client, transport } = await connect(f);
  const pid = transport.pid;
  try {
    const tools = await client.listTools(); assert.deepEqual(tools.tools.map(t => t.name).sort(), names);
    const first = json(await client.callTool({ name: 'jev_navigate', arguments: { task: 'Search coffee', start_url: f.origin, screenshot: 'none' } }));
    assert.equal(first.status, 'needs_input');
    const end = json(await client.callTool({ name: 'jev_resume', arguments: { session_id: first.session_id, request_id: first.request_id, text: 'coffee' } }));
    assert.equal(end.status, 'done');
    const count = f.calls.length;
    const page = json(await client.callTool({ name: 'jev_read', arguments: { session_id: first.session_id, screenshot: 'none' } }));
    assert.match(page.page.content, /Result destination/); assert.equal(f.calls.length, count);
    const c = json(await client.callTool({ name: 'jev_close', arguments: { session_id: first.session_id } }));
    assert.equal(c.status, 'closed');
  } finally { await client.close(); await f.close(); }
  if (pid) assert.throws(() => process.kill(pid, 0), /ESRCH/);
});

test('stdio disconnect with an active session exits and cannot restore old sessions', async () => {
  const f = await fixture(body => decision(body, c => match(c, 'search_')));
  let connection = await connect(f);
  try {
    const first = json(await connection.client.callTool({ name: 'jev_navigate', arguments: { task: 'Search', start_url: f.origin, screenshot: 'none' } }));
    const oldPid = connection.transport.pid;
    await connection.client.close();
    if (oldPid) assert.throws(() => process.kill(oldPid, 0), /ESRCH/);
    connection = await connect(f);
    const r = json(await connection.client.callTool({ name: 'jev_resume', arguments: { session_id: first.session_id, request_id: first.request_id, text: 'x' } }));
    assert.equal(r.code, 'session_expired');
  } finally { await connection.client.close(); await f.close(); }
});

test('CLI exits with needs_input and no resumable claim', async () => {
  const f = await fixture(body => decision(body, c => match(c, 'search_')));
  try {
    const child = spawn(process.execPath, [entry, 'run', 'Search', f.origin, '--no-screenshot'], { env: env(f) });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => stdout += c); child.stderr.on('data', c => stderr += c);
    const [code] = await once(child, 'close');
    assert.equal(code, 3, stderr); const r = JSON.parse(stdout);
    assert.equal(r.status, 'needs_input'); assert.equal(r.session_closed, true); assert.match(r.message, /cannot be resumed/);
    assert.ok(!stdout.includes(KEY) && !stderr.includes(KEY));
  } finally { await f.close(); }
});

test('MCP defaults to reuse; only new_instance=true creates another session', async () => {
  const f = await fixture(body => decision(body));
  const { client } = await connect(f);
  try {
    const tools = await client.listTools();
    const schema = tools.tools.find(t => t.name === 'jev_navigate').inputSchema;
    assert.equal(schema.properties.new_instance.type, 'boolean');
    const call = args => client.callTool({ name: 'jev_navigate', arguments: { task: 'Batch item', start_url: f.origin, screenshot: 'none', ...args } }).then(json);
    const first = await call({}); const second = await call({});
    assert.equal(first.status, 'done'); assert.equal(second.session_id, first.session_id);
    const extra = await call({ new_instance: true });
    assert.equal(extra.status, 'done'); assert.notEqual(extra.session_id, first.session_id);
    await client.callTool({ name: 'jev_close', arguments: { session_id: extra.session_id } });
    await client.callTool({ name: 'jev_close', arguments: { session_id: first.session_id } });
  } finally { await client.close(); await f.close(); }
});
