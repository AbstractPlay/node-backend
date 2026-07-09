# Deployment

## Automatic deploys

GitHub Actions deploy via Serverless Framework:

| Branch / trigger | Workflow | Stage |
|------------------|----------|-------|
| `develop` push | [`.github/workflows/deploy-dev.js.yml`](../.github/workflows/deploy-dev.js.yml) | `dev` |
| `main` push | [`.github/workflows/deploy-prod.js.yml`](../.github/workflows/deploy-prod.js.yml) | `prod` |
| `repository_dispatch` `dep_update_dev` | deploy-dev | `dev` |
| `repository_dispatch` `dep_update_prod` | deploy-prod | `prod` |

Downstream repos (e.g. gameslib) can trigger backend redeploys after package publishes.

## Manual deploy

With AWS profiles configured:

```bash
npm run build
serverless deploy              # dev (default stage)
serverless --stage prod deploy # prod
```

Or use npm scripts: `npm run deploy-dev`, `npm run deploy-prod`, `npm run full-dev`, `npm run full-prod`.

## Stage configuration

Per-stage settings live in `serverless.yml` under `custom.stageConfig`:

- Cognito user pool and app client (human players)
- Bot Cognito pool, token URL, OAuth scope
- SQS URLs (AiAi queue, WebSocket messages, bot outbound)
- WebSocket API domain

Table name: `abstract-play-${stage}`.

## Required GitHub secrets

- `AWS_KEY`, `AWS_SECRET` — deploy credentials
- `PAT_READ_PACKAGES` — npm install from GitHub Packages
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `TOTP_KEY`, `OPENSSH_PRIVATE_KEY`
- `TEST_BOT_CLIENT_ID`, `TEST_BOT_CLIENT_SECRET` (dev workflow)

## Cognito setup (essentials)

Each stage needs a Cognito user pool with an app client for the front end:

1. Create a user pool (defaults are fine).
2. Add an app client — **do not** generate a client secret.
3. Copy the pool ARN into `serverless.yml` (`custom.stageConfig.{stage}.userpool`) for the `authQuery` authorizer.
4. App client settings: enable identity providers; set callback/sign-out URLs (`http://localhost:3000` for local dev; `https://play.dev.abstractplay.com` / `https://play.abstractplay.com` for deployed front ends).
5. OAuth: Authorization code grant, Implicit grant, `openid` scope; enable `aws.cognito.signin.user.admin` and `Email`.

Bot pools are separate per stage — see [Bots](/backend/subsystems/bots/).

## Documentation deploys

When a push to `develop` or `main` includes changes under `docs/`, the deploy workflow dispatches `dep_update_dev` / `dep_update_prod` to the [docs](https://github.com/AbstractPlay/docs) repository so the site rebuilds with updated submodule content.

## Related

- [Getting started](/backend/getting-started/)
- [Architecture](/backend/architecture/)
