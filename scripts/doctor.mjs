#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { installedChrome } from './installed-chrome.mjs';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
let browser, client;
try {
  const chromePath = installedChrome();
  browser = await chromium.launch({ executablePath: chromePath, headless: true, timeout: 15000 });
  const page = await browser.newPage();
  await page.setContent('<title>Jev Browser installation check</title><p>Local check only</p>');
  if (await page.title() !== 'Jev Browser installation check') throw new Error('Chrome page check failed.');
  console.log('PASS: existing Google Chrome launched and rendered a local page.');
  await browser.close(); browser = undefined;
  const windows = process.platform === 'win32';
  const launcher = fileURLToPath(new URL(windows ? './start.cmd' : './start.sh', import.meta.url));
  const transport = new StdioClientTransport({
    command: windows ? 'cmd.exe' : 'sh', args: windows ? ['/d', '/c', launcher] : [launcher],
    env: { ...process.env, JEV_API_URL: '', JEV_API_KEY: '', JEV_BROWSER_EXECUTABLE_PATH: chromePath }, stderr: 'pipe',
  });
  client = new Client({ name: 'jev-installation-check', version: '1.0.0' });
  await client.connect(transport);
  const expected = ['jev_close', 'jev_continue', 'jev_navigate', 'jev_read', 'jev_resume'];
  const actual = (await client.listTools()).tools.map(t => t.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unexpected MCP tool list.');
  console.log('PASS: MCP handshake and all five tools. No inference API calls were made.');
} catch (error) {
  console.error(`Installation check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
  await browser?.close().catch(() => {});
}
