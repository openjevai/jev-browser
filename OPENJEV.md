# OpenJEV support

This fork adds optional [OpenJEV](https://openjev.sh) support alongside the existing
TypeSafe and OpenRouter providers. OpenJEV is a free community gateway to the same
Jev model built by [TypeSafe](https://typesafe.ai). TypeSafe remains the default;
anyone using a TypeSafe endpoint sees zero behaviour change.

## What was added

- `src/provider.ts` — hostname detection for `api.openjev.sh` selects the default
  model `openjev` (mirroring the existing OpenRouter hostname detection). Any other
  hostname still defaults to `jev-latest` (TypeSafe). `JEV_MODEL` overrides any
  default as before. No TypeSafe code path was renamed, removed or re-defaulted.
- `README.md` — OpenJEV row added to the service table; a short OpenJEV support
  note added after the project intro (TypeSafe credited first).
- `INSTALL_FOR_AGENT.md` — OpenJEV endpoint listed next to the TypeSafe endpoint.
- `test/provider.test.mjs` — assertions that `api.openjev.sh` resolves to model
  `openjev` and that `JEV_MODEL` still overrides it.

## Provider selection rule

This package uses a single `JEV_API_URL` + `JEV_API_KEY` configuration. The model
is chosen by hostname:

1. `JEV_MODEL` (explicit) always wins.
2. `api.openrouter.ai` hostname → `typesafe/jev-1.13`.
3. `api.openjev.sh` hostname → `openjev`.
4. Any other hostname → `jev-latest` (TypeSafe default, unchanged).

To use OpenJEV, set:
```
JEV_API_URL=https://api.openjev.sh/v1/systemone
JEV_API_KEY=<your OpenJEV key from https://openjev.sh/dashboard>
```

## How it was verified

- Code review of the diff (no TypeSafe default changed, no endpoint removed).
- One live `POST https://api.openjev.sh/v1/systemone` request with model `openjev`,
  state `ping`, one `noul` question — returned HTTP 200.
- `grep` confirms no hardcoded `api.typesafe.ai` default was introduced; the
  TypeSafe endpoint remains documented as before.

The project's own tests/builds were not executed (third-party code is never run
during porting).

## Upstream

Original project: https://github.com/wendaoheri/jev-browser by @wendaoheri
(based on https://github.com/jkudish/jev-browser). MIT license preserved.
