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

## gameProjector stream (automatic in CI)

The DynamoDB table must have streams enabled **before** CloudFormation can reference `StreamArn`. The stream Lambda trigger is gated by the `enableGameProjectorStream` deploy parameter.

**CI** (`bin/serverless-deploy.sh`) checks `LatestStreamArn` on the stage table before deploy:

- **No stream yet** → `enableGameProjectorStream=false` (enables `StreamSpecification` on the table; deploys `gameProjector` Lambda without a trigger).
- **Stream exists** → `enableGameProjectorStream=true` (creates `GameProjectorEventSourceMapping` + DLQ wiring).

So the **first** deploy to a new stage only enables streams. The **next** CI run on that stage attaches the mapping. No manual flags.

**Local manual deploy** (same two-step logic):

```bash
npm run build
bash bin/serverless-deploy.sh dev AbstractPlayDev
# After first run succeeds, any later run passes enableGameProjectorStream=true automatically.
```

Once a stage has a stream, always deploy with `true` (or use the script) so CloudFormation does not remove the event source mapping.

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
