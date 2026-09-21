# Development

This local fork exposes persistent MCP browser sessions. The host agent supplies
all ordinary text; the only model transport is Jev Decisions HTTP.

```bash
npm ci
npm run typecheck
npm run build
npm test
```

The default suite uses a real Chromium browser and local fixture/decision servers.
No API key is required. `npm run test:live` is optional and requires explicit
`JEV_API_URL` / `JEV_API_KEY` configuration for its paid cases.

Behavioral invariants:

- No text-generation provider, keyword fallback, MCP sampling or agent subprocess.
- A resumed text request can execute at most once; stale targets discard text.
- Browser state persists across calls, execution budgets do not count host waits.
- Password source/origin checks, redaction and screenshot suppression are retained.
- Invalid inference answers cannot execute browser actions; unknown usage stays null.
- Normal logs use stderr; stdout is reserved for MCP or CLI result JSON.

Keep fixture tests deterministic and preserve existing password regression tests.
Changes to the public tool contract require updated client examples and README.
