# Getting started

## Prerequisites

- **Node.js 24** (matches `serverless.yml` runtime)
- **AWS CLI** with profiles `AbstractPlayDev` and `AbstractPlayProd` in `~/.aws/credentials`
- Access to the `@abstractplay` GitHub Packages scope

## Install and build

```bash
npm install
npm run build
```

`npm run build` runs ESLint and TypeScript (`tsc`). To compile only:

```bash
npm run build-ts
```

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
api/           Main Lambda handlers (abstractplay.ts, sockets/, testBot.ts)
lib/           Shared libraries (bots, DDB, WebSocket broadcast)
utils/         Scheduled jobs (yourturn, bot-outbound consumer)
locales/       i18n strings for emails and push notifications
serverless.yml Infrastructure and function definitions
```

## Next steps

- [Architecture](/backend/architecture/)
- [Database schema](/backend/database-schema/)
- [API overview](/backend/api/overview/)
- [Deployment](/backend/deployment/)
