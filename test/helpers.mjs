import http from 'node:http';
export const KEY = 'jev-local-test-only-key-123456';
export function decision(body, choose = 'done', overrides = {}) {
  const answers = {};
  for (const [name, q] of Object.entries(body.questions)) {
    if (q.type === 'choice') {
      const choice = typeof choose === 'function' ? choose(q.criteria, name, body.state) : choose;
      answers[name] = { type: 'choice', choice, probabilities: { [choice]: 1 }, confidence: 1 };
    } else answers[name] = { type: 'noul', noul: 0 };
  }
  return { answers, ...overrides };
}
export function match(criteria, prefix, label = '') {
  const entry = Object.entries(criteria).find(([id, desc]) => id.startsWith(prefix) && desc.includes(label));
  if (!entry) throw new Error(`Missing ${prefix} ${label}: ${JSON.stringify(criteria)}`);
  return entry[0];
}
export async function fixture(handler = body => decision(body)) {
  const calls = [], submissions = [];
  let next = handler;
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/') || req.url === '/v1/systemone') {
      let text = ''; for await (const chunk of req) text += chunk;
      try {
        const body = JSON.parse(text);
        calls.push({ body, url: req.url, authorization: req.headers.authorization });
        const result = await next(body, req, res);
        if (!res.writableEnded && result !== undefined) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); }
      } catch (e) { res.statusCode = 500; res.end(String(e)); }
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url.startsWith('/result')) {
      submissions.push(req.url);
      res.end('<title>Results</title><body>Result destination <a href="/next">Next article</a></body>'); return;
    }
    if (req.url === '/next') { res.end('<title>Next</title><body>Final article</body>'); return; }
    res.end(`<title>Fixture</title><body>
      <a href="/next">Next article</a><a href="/next" target="_blank">New tab</a>
      <form action="/result"><label>Search query<input type="search" name="q"></label></form>
      <form action="/result"><label>Full name<input name="name"></label>
      <label>Message<textarea name="message"></textarea></label><button type="submit">Send form</button></form>
      <label>Cabin<select name="cabin"><option value=""></option><option>Economy</option><option>Business</option></select></label>
      <label>Password<input type="password" name="password" oninput="document.querySelector('#echo').textContent=this.value"></label>
      <div id="echo"></div>
    </body>`);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, calls, submissions, setHandler(fn) { next = fn; }, async close() {
    server.closeAllConnections(); await new Promise(r => server.close(r));
  } };
}
export function configure(origin) {
  process.env.JEV_API_URL = `${origin}/api/decisions`;
  process.env.JEV_API_KEY = KEY;
  delete process.env.JEV_MODEL;
}
export function livePage(manager, id) { return manager.sessions.get(id).page; }
