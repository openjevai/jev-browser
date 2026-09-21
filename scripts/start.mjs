#!/usr/bin/env node
// Prefer the browser installed alongside this checkout; an explicit setting wins.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error('[jev-browser] Node.js 20 or newer is required. Install it from https://nodejs.org/en/download and restart your Agent application.');
  process.exit(1);
}
const browsers = fileURLToPath(new URL('../.playwright', import.meta.url));
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(browsers)) process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
await import('../dist/index.js');
