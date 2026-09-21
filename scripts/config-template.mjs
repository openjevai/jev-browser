import { fileURLToPath } from 'node:url';
export function makeConfig(client, { headed = true, chromePath, platform = process.platform } = {}) {
  const windows = platform === 'win32';
  const launch = fileURLToPath(new URL(windows ? './start.cmd' : './start.sh', import.meta.url));
  const command = windows ? 'cmd.exe' : 'sh';
  const args = windows ? ['/d', '/c', launch] : [launch];
  const env = {
    JEV_API_URL: 'https://openrouter.ai/api/alpha/decisions',
    JEV_API_KEY: 'YOUR_JEV_API_KEY',
    JEV_BROWSER_CHANNEL: 'chrome',
    JEV_BROWSER_HEADED: headed ? '1' : '0',
    ...(chromePath ? { JEV_BROWSER_EXECUTABLE_PATH: chromePath } : {}),
  };
  if (client === 'codex') {
    return `[mcp_servers.jev-browser]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\nstartup_timeout_sec = 30\ntool_timeout_sec = 60\n\n[mcp_servers.jev-browser.env]\n` +
      Object.entries(env).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join('\n') + '\n';
  }
  if (['qoder', 'claude'].includes(client)) return JSON.stringify({ mcpServers: { 'jev-browser': { command, args, env } } }, null, 2) + '\n';
  throw new Error('Client must be codex, qoder or claude.');
}
