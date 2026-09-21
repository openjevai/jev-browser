#!/usr/bin/env node
// Print a template; never read real keys or modify client settings.
import { makeConfig } from './config-template.mjs';
try {
  const [client, ...flags] = process.argv.slice(2);
  if (flags.some(f => f !== '--headless')) throw new Error('Unknown option.');
  process.stdout.write(makeConfig(client, { headed: !flags.includes('--headless') }));
} catch {
  console.error('Usage: node scripts/client-config.mjs codex|qoder|claude [--headless]');
  process.exitCode = 1;
}
