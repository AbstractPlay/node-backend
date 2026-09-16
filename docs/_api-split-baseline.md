# API split — Phase 0 baseline

Captured **2026-09-16** before splitting [`api/abstractplay.ts`](../api/abstractplay.ts).

Use this file to compare bundle sizes and monolith size after each migration phase.

## Monolith size

| Metric | Value |
|--------|------:|
| `api/abstractplay.ts` lines (non-empty) | 10,062 |
| `async function` / handler implementations | ~170 |
| Lambda exports | `query`, `authQuery`, `botQuery` |
| Other runtime exports | `botRespondToChallenge`, `changeLanguageForPlayer`, `initi18n`, `createSendEmailCommand`, `formatReturnError`, `logGetItemError`, `handleCommonErrors` |

### Approximate regions (by first line of symbol)

| Region | Lines (approx) | Notes |
|--------|----------------|-------|
| Imports, locale setup, AWS clients, types | 1–666 | Duplicate `ddbDocClient` vs [`lib/ddb.ts`](../lib/ddb.ts) |
| Lambda dispatch (`query` / `botQuery` / `authQuery` switches) | 740–1136 | ~27 public cases, ~75+ auth cases, 1 bot verb |
| Catalog / challenges (public) | 1138–1593 | `userNames`, `games`, `metaGamesDetails`, … |
| `game()` read path | 1594–1751 | Shared auth + public |
| Playground auth glue | 1752–1916 | |
| Announcements HTTP glue | 1917–2227 | Logic in `lib/announcements` |
| Feedback HTTP glue | 2228–2660 | Logic in `lib/feedback` |
| Player marks + public player pages | 2661–2973 | |
| Game settings / inject state | 2974–3307 | |
| Bot CRUD + Cognito | 3308–3831 | |
| Me / profile / settings | 3832–4889 | Uses `lib/meQuery` |
| Challenges (auth) | 4892–5798 | Includes `botRespondToChallenge` (exported) |
| Moves, timeloss, comments, exploration | 5799–7379 | Largest block; heavy `gameslib` |
| Tournaments | 7382–8162 | |
| Events | 8163–9467 | |
| Admin / ops / email helpers / misc | 9470–10574 | `deleteGames`, `test_push`, shared email/i18n exports |

## Test Lambda bundles (`npm run build:lambda-bundles`)

Esbuild output under [`.test-artifacts/lambda-bundles/`](../.test-artifacts/lambda-bundles/).  
`gameslib` / `@aws-sdk/*` are **external** (loaded from Lambda layer at runtime), same as deploy.

| Bundle | Bytes | KiB |
|--------|------:|----:|
| `api/abstractplay.mjs` (Phase 0 single entry) | 787,570 | 769 |
| `api/query.mjs` (Phase 2) | 399,570 | 390 |
| `api/query.mjs` (Phase 4) | 405,477 | 396 |
| `api/query.mjs` (Phase 5, post-auth split) | 407,429 | 398 |
| `api/query.mjs` (Phase 6) | 409,926 | 401 |
| `api/authQuery.mjs` (Phase 2) | 736,313 | 719 |
| `api/authQuery.mjs` (Phase 5) | 739,895 | 723 |
| `api/authQuery.mjs` (Phase 6) | 742,698 | 725 |
| `api/query.mjs` (Phase 7 partial) | 384,692 | 376 |
| `api/authQuery.mjs` (Phase 7 partial) | 716,066 | 700 |
| `api/query.mjs` (Phase 7 complete) | 367,971 | 359 |
| `api/authQuery.mjs` (Phase 7 complete) | 718,268 | 702 |
| `api/abstractplay.ts` lines (Phase 8) | — | ~689 |
| `api/authQuery.mjs` (Phase 8) | 718,903 | 703 |
| `api/botQuery.mjs` (Phase 2) | 300,117 | 293 |
| `api/botQuery.mjs` (Phase 9) | 116,531 | 114 |
| `utils/bot-outbound.mjs` | 798,806 | 781 |
| `utils/yourturn.mjs` | 251,850 | 246 |
| `api/sockets/authHandler.mjs` | 47,628 | 47 |
| `api/testBot.mjs` | 24,462 | 24 |
| `utils/game-projector.mjs` | 12,522 | 12 |
| Other socket handlers | 121–7,058 | |

**Note:** Test bundles use three entries — `api/query.ts`, `api/authQuery.ts`, `api/botQuery.ts` ([`scripts/lambda-esbuild-config.mjs`](../scripts/lambda-esbuild-config.mjs)).

### Deploy package (baseline)

`serverless package --stage dev` completed successfully (~648s build including `build:layers`).

| Artifact | Bytes | KiB |
|----------|------:|----:|
| `.serverless/abstract-play.zip` (service code bundle) | 1,100,095 | 1,074 |
| `.serverless/abstractplayLibs.zip` (Lambda layer) | 24,706,132 | 24,127 |
| `.serverless/custom-resources.zip` | 12,787 | 12 |

Serverless v4 emits one **service** zip here, not separate `query` / `authQuery` / `botQuery` files on disk. Compare per-handler sizes via `.test-artifacts/lambda-bundles/`.

## Phase 10 — monolith retired (2026-09-16)

`api/abstractplay.ts` removed. HTTP entries: `api/query.ts`, `api/authQuery.ts`, `api/botQuery.ts` → `api/routes/*` → `lib/*`. Move hooks: `lib/games/registerMoveHooks.ts` (imported from `playHandlers`). One-off migration scripts under `scripts/phase*.mjs` deleted.

## RPC surface (unchanged by split)

| Endpoint | Serverless handler | Dispatch |
|----------|-------------------|----------|
| GET/POST `/query` | `api/query.query` | `api/routes/public.ts` |
| POST `/authQuery` | `api/authQuery.authQuery` | `api/routes/auth/index.ts` |
| POST `/botQuery` | `api/botQuery.botQuery` | `api/routes/bot.ts` |

## Phase comparison template

Copy for PR descriptions:

```markdown
### Bundle sizes vs baseline (docs/_api-split-baseline.md)
| Function | Phase 0 | This PR |
|----------|--------:|--------:|
| query (test bundle or .serverless zip) | 787570 B | |
| authQuery | (same module) | |
| botQuery | (same module) | |
| abstractplay.ts lines | 10062 | |
```
