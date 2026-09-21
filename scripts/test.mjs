// Run tests against the checkout's browser without changing global caches.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const browsers = fileURLToPath(new URL('../.playwright', import.meta.url));
const env = { ...process.env };
if (!env.PLAYWRIGHT_BROWSERS_PATH && existsSync(browsers)) env.PLAYWRIGHT_BROWSERS_PATH = browsers;
const supplied = process.argv.slice(2);
const files = supplied.length ? supplied : ['test/unit.test.mjs', 'test/provider.test.mjs', 'test/session.test.mjs', 'test/mcp.test.mjs'];
const child = spawn(process.execPath, ['--test', ...files], { cwd: root, env, stdio: 'inherit' });
child.on('error', () => { process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
