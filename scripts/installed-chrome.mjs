import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
export function installedChrome(override = process.env.JEV_BROWSER_EXECUTABLE_PATH) {
  const candidates = override ? [resolve(override)] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  ] : process.platform === 'win32' ? [
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  ] : ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
  for (const candidate of candidates.filter(Boolean)) {
    try { accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK); return candidate; } catch {}
  }
  throw new Error('Installed Google Chrome was not found. Install Chrome yourself, or set JEV_BROWSER_EXECUTABLE_PATH to the existing executable. No browser has been downloaded.');
}
