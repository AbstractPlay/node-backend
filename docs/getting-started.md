# Getting started

## Prerequisites

- **Node.js 24** (matches `serverless.yml` runtime)
- **AWS CLI** with profiles `AbstractPlayDev` and `AbstractPlayProd` in `~/.aws/credentials`
- Access to the `@abstractplay` GitHub Packages scope

## Install and build

```bash
npm install
npm run setup-git   # once per clone — enables merge=ours for package pins (develop↔main)
npm run build
```

`npm run build` runs ESLint and TypeScript typecheck (`tsc --noEmit`). Lambda handlers are bundled at deploy time by serverless-esbuild; there is no separate `lib/*.js` compile step.

Maintained ops CLIs live under `scripts/` (`node scripts/<script>.mjs` or `npm run …`; **tsx** when they import `lib/*.ts`). BGG and Discord imports accept optional user maps (`scripts/bgg-ap-user-map.json`, `scripts/discord-ap-user-map.json`; see `.example.json` files). **`bin/`** is gitignored local scratch (e.g. ladder calibration JSON from `npm run analyze-ladder-calibration`). Abandoned-account sizing (read-only S3 dump download, large): `npm run list-abandoned-account-candidates -- --download` (AbstractPlayProd profile).

**Dev auth RPC (multi-player):** copy `test/fixtures/dev-test-players.example.json` ? `dev-test-players.json` (gitignored), seed Cognito refresh tokens with `npx tsx scripts/seed-dev-test-players.ts`, then `npx tsx scripts/dev-auth-query.ts`. See [Dev auth RPC testing](/backend/testing/dev-auth-rpc/).

## GitHub Packages

Private packages require a `.npmrc`:

```
@abstractplay:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=<PAT with read:packages>
```

CI creates this from the `PAT_READ_PACKAGES` secret (see [`.github/workflows/deploy-dev.js.yml`](../.github/workflows/deploy-dev.js.yml)).

## Local gameslib development

To test against a local rules engine build:

```bash
npm install /path/to/gameslib.tgz
```

Or point at a packed tarball from a gameslib checkout.

## Environment variables

Lambda env vars are set in [`serverless.yml`](../serverless.yml). Secrets are injected in CI from GitHub Actions secrets:

| Variable | Purpose |
|----------|---------|
| `TOTP_KEY` | Organizer TOTP validation |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push |
| `OPENSSH_PRIVATE_KEY` | Some maintenance/crypto paths |
| `TEST_BOT_CLIENT_ID` / `TEST_BOT_CLIENT_SECRET` | Dev reference bot (dev only) |

Do not commit secret values. Names only are listed here.

## Dev reference bot

The `testBot` Lambda is enabled on the **dev** stage only. Full protocol documentation is in the header of [`api/testBot.ts`](../api/testBot.ts). See [Bots](/backend/subsystems/bots/).

## Project layout

```
api/           Lambda entries (query.ts, authQuery.ts, botQuery.ts, routes/, sockets/, testBot.ts)
lib/           Shared libraries (bots, DDB, WebSocket broadcast)
utils/         Shared handlers (yourturn, feedback jobs — deployed via crons/); bot-outbound SQS consumer
crons/         Scheduled Lambda stack (Serverless app abstract-play-backend-crons)
locales/       i18n strings for emails and push notifications
serverless.yml Infrastructure and function definitions
```

## Next steps

- [Architecture](/backend/architecture/)
- [Database schema](/backend/database-schema/)
- [API overview](/backend/api/overview/)
- [Deployment](/backend/deployment/)
