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

## AP dependency pins (`ci-deps.*.json`)

Canonical pins live in `ci-deps.dev.json` and `ci-deps.prod.json`. CI runs `npm ci` → manifest validation → `bin/install-ap-deps.mjs --stage dev|prod` → strict sync check → build/test.

After a merge that touches dependency files, run `npm run sync-deps` on `develop` (or `npm run sync-deps:prod` on `main`) and commit `ci-deps.*.json`, `package.json`, and `package-lock.json` together. Do not hand-merge AP version strings in `package.json`.

`ci-deps.prod.json` is protected on `main` via `.gitattributes` (`merge=ours`). `package.json` and `package-lock.json` are regenerated via `sync-deps`, not merge=ours.

Prod deploys may fail at build when code on `main` uses a gameslib API not yet in the prod pin — wait for `dep_update_prod` or bump `ci-deps.prod.json` when releasing.

## Lambda module-load checks (CI)

Deploy workflows run `npm test` after `npm run build`. `test/lambdaInit.test.js` dynamically imports `@abstractplay/gameslib` and `api/abstractplay.js` the same way Lambda cold-starts do (ESM gameslib from the shared layer, esbuild-bundled handler).

Handlers are packaged with **serverless-esbuild** (ESM `.mjs` bundles). Heavy `@abstractplay/*` dependencies live in a shared Lambda layer built by `npm run build:layers` before `serverless package` / deploy.

CJS packages that use dynamic `require()` (e.g. `web-push`, `@sunknudsen/totp`, `i18next`) must stay in the esbuild `external` list so they load from `node_modules` at runtime — bundling them into ESM output causes init errors like `Dynamic require of "crypto" is not supported`.

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

## Ops alerts (email)

When `OPS_ALERT_EMAIL` is set at deploy time, CloudFormation creates an SNS topic (`abstractplay-ops-alerts-${stage}`) and wires **gameProjector** alarms to it:

| Alarm | Signal |
|-------|--------|
| `abstractplay-game-projector-errors-${stage}` | Lambda `Errors` ≥ 1 in 1 minute (catches init crashes) |
| `abstractplay-game-projector-dlq-${stage}` | DLQ depth ≥ 1 message |
| `abstractplay-game-projector-iterator-age-${stage}` | Stream `IteratorAge` > 5 minutes for 10 minutes |

**First deploy:** SNS sends a subscription confirmation email — you must click **Confirm subscription** once or alarms will not arrive.

**Local / manual deploy:**

```bash
export OPS_ALERT_EMAIL=you@example.com
bash bin/serverless-deploy.sh prod AbstractPlayProd
```

Omit `OPS_ALERT_EMAIL` to skip the topic and alarm actions (dev deploys by default).

## Required GitHub secrets

- `AWS_KEY`, `AWS_SECRET` — deploy credentials
- `PAT_READ_PACKAGES` — npm install from GitHub Packages
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `TOTP_KEY`, `OPENSSH_PRIVATE_KEY`
- `OPS_ALERT_EMAIL` — ops CloudWatch alarm notifications (prod workflow)
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
