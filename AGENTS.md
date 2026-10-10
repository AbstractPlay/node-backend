# Agent guide — node-backend

Abstract Play API: Serverless Framework, Node.js 24 Lambdas, DynamoDB single-table. Human docs: [docs.abstractplay.com/backend/](https://docs.abstractplay.com/backend/) (from [`docs/`](docs/)).

## Abstract Play (wide)

Follow the canonical org-wide policy in [gameslib `AGENTS.md` — Abstract Play (wide)](https://github.com/AbstractPlay/gameslib/blob/develop/AGENTS.md#abstract-play-wide).

## Layout

| Area | Purpose |
|------|---------|
| `api/` | Thin Lambda entries (`query`, `authQuery`, `botQuery`) |
| `api/routes/` | Query name → handler routing (source of truth for RPC names) |
| `lib/` | Business logic imported by routes |
| `bin/` | Ops scripts (`.mjs`; some use `tsx` when importing `lib/*.ts`) |
| `locales/en/apback.json` | English notification/email strings |
| `crons/` | Scheduled jobs workspace (`abstractplay-backend-crons`) |
| `serverless.yml` | Functions, env, stages |

RPC envelope: clients send `query` + `pars` — not REST resources. See [docs/architecture.md](docs/architecture.md).

## Commands

| Command | When |
|---------|------|
| `npm test` | `pretest` builds lambda bundles; then typecheck, Vitest, `node:test` scripts |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Locale JSON format, ESLint, cron pin check, typecheck, `lint:crons` |
| `npm run build` | Same as lint (no separate compile — esbuild at deploy) |
| `npm run test:crons` | After changes under `crons/` |
| `npm run sync-deps` | Refresh `@abstractplay/*` pins (+ cron nested deps) |

Handoff: **`npm run typecheck`** and **`npm run lint`** (exit 0), plus tests for touched areas.

## Testing

- **Vitest** — unit tests under `test/`.
- **`test/lambdaInit.test.mjs`** — every bundled handler imports cleanly; gameslib loads under deploy-like ESM. Requires `npm run build:lambda-bundles` (`pretest`).
- Prefer **inline fixtures** in test files; do not depend on live DynamoDB or uncommitted dumps. Commit any static JSON under `test/` if needed.

Ops: `node bin/<script>.mjs` for AWS-only scripts; `npm run dump-dashboard` / import scripts use **tsx** when they import `lib/*.ts` — [docs/getting-started.md](docs/getting-started.md).

## Internationalization

Edit **`locales/en/apback.json`** only. Other languages are Weblate + `bin/translate.mjs`. Game titles in notifications use gameslib `apgames:names.*` bundles. [docs/i18n.md](docs/i18n.md).

## Cross-repo changes

Rules-engine behaviour lives in **gameslib**. After gameslib releases, bump pins via `ci-deps` / `sync-deps`. Coordinate with gameslib tests and front `npm run test:engines` when move validation or exploration contracts change.

Prod deploy runs **two** stacks: API/WebSocket and `crons/` — note in changelog when cron behaviour ships.

## Documentation

New `docs/**/*.md` → [`docs/nav.json`](docs/nav.json). Published site paths use `/backend/...`.

## Changelog

[`CHANGELOG.md`](CHANGELOG.md) — substantive API/ops changes; monthly `[1.0.0-ci]` batching per file header.

## Secrets

Env vars in `serverless.yml`; values from CI secrets only — never commit keys or `.env`.

## Contact

[#dev-curious on Discord](https://discord.abstractplay.com)
