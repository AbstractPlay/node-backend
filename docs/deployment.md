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

Each deploy runs **two** Serverless stacks (API first, then crons):

| Stack | Service name | Deploy (CI) |
|-------|----------------|-------------|
| API / WebSocket | `abstract-play` | `bash scripts/serverless-deploy.sh <stage> <profile>` |
| Scheduled jobs | `abstract-play-backend-crons` | `bash crons/scripts/serverless-deploy.sh <stage>` |

The former [backend-crons](https://github.com/AbstractPlay/backend-crons) repository is **archived**; deploy and develop only from this repoï¿½s `crons/` workspace.

Crons source lives in [`crons/`](https://github.com/AbstractPlay/node-backend/tree/develop/crons). See [Crons deployment](/crons/deployment/).

Both stacks tag billable resources with `ap:service` (Serverless `service` name) and `ap:stage` (`dev` / `prod`) for AWS Cost Explorer. Activate those keys once per account under **Billing ? Cost allocation tags**.

## AP dependency pins (`ci-deps.*.json`)

Canonical pins live in `ci-deps.dev.json` and `ci-deps.prod.json`. CI runs `npm ci` ? manifest validation ? `ap-install-deps --stage dev|prod` ? strict lockfile check ? build/test.

After merging `develop` into `main` (or another branch that changes dependency files), run `npm run sync-deps:prod` on `main` or `npm run sync-deps` on `develop`, then commit if anything changed. Do not hand-merge AP version strings in `package.json`.

`npm run sync-deps` runs `ap-install-deps` at the repo root, copies AP pins into `crons/package.json` from the root manifest, then prunes any stale `crons/node_modules/@abstractplay` tree. Deploy/Test workflows run `scripts/sync-crons-ap-deps.mjs` **before** `npm ci` so a stale `crons/package.json` (for example after a cross-branch merge with `merge=ours`) cannot break install. The gameslib relay auto-commit on `dep_update_dev` / `dep_update_prod` also stages `crons/package.json` with the root manifests. `postinstall` re-runs sync after install; `npm run lint` runs `check-crons-ap-pins` so committed pins cannot drift from root. Locally after a merge, prefer `npm run ci:install` (or `ci:install:prod` on `main`) instead of bare `npm ci` if install fails on workspace pin mismatch.

`.gitattributes` marks `ci-deps.prod.json`, `ci-deps.dev.json`, `package-lock.json`, and `crons/package.json` with `merge=ours` so the branch you merge **into** keeps its pins until you run `sync-deps`. Root **`package.json`** merges normally (npm `scripts` stay in sync); after **develop?main**, run **`npm run sync-deps:prod`** on `main` if `@abstractplay/*` versions drifted. Register Git's **`merge.ours` driver** with **`npm run setup-git`** once per clone. Do not hand-pick AP version lines from the other branch.

**GitHub pull-request merges** do not run custom merge drivers. For a conflict-free prod merge, check out `main`, run `npm run setup-git`, merge `develop` locally, push `main`; or on the PR conflict UI, keep **`main`**'s copies of the pin manifests listed above (and the same for **`develop`** when back-merging `main`).

Prod deploys may fail at build when code on `main` uses a gameslib API not yet in the prod pin — wait for `dep_update_prod` or bump `ci-deps.prod.json` when releasing.

## Lambda module-load checks (CI)

Deploy workflows run `npm test` after `npm run build`. `pretest` runs `npm run build:lambda-bundles`, which esbuilds every Lambda handler entry with the same options as serverless-esbuild (ESM `.mjs`, same `external` list). `vitest run` executes unit tests from `test/**/*.test.ts`. `test/lambdaInit.test.mjs` dynamically imports those bundles plus `@abstractplay/gameslib` ï¿½ matching Lambda cold-start module loading.

If vitest fails with `exports is not defined` loading `lib/*.js`, delete stale local `tsc` sidecars (`lib/*.js`, `utils/*.js`) left over from before the ESM flip ï¿½ they are gitignored and must not remain on disk beside the `.ts` sources.

Handlers are packaged with **serverless-esbuild** (ESM `.mjs` bundles). Heavy `@abstractplay/*` dependencies live in a shared Lambda layer built by `npm run build:layers` before `serverless package` / deploy.

CJS packages that use dynamic `require()` (e.g. `web-push`, `@sunknudsen/totp`, `i18next`) must stay in the esbuild `external` list so they load from `node_modules` at runtime ï¿½ bundling them into ESM output causes init errors like `Dynamic require of "crypto" is not supported`.

## Manual deploy

With AWS profiles configured:

```bash
npm run build
npx serverless deploy              # dev (default stage)
npx serverless --stage prod deploy # prod
```

Or use npm scripts: `npm run deploy-dev`, `npm run deploy-prod`, `npm run full-dev`, `npm run full-prod` (they invoke the pinned `serverless` devDependency).

### Serverless v4 and secrets

Serverless Framework **v4** resolves `provider.environment` when you run `serverless package`, `print`, or `deploy`. CI and local deploys use the pinned **`serverless@4.42.0`** devDependency via `npx serverless` (no global Serverless install). The Dashboard org is **`abstractplay`** (`SERVERLESS_ORG` in CI; `org:` in `serverless.yml`).

- **CI:** GitHub Actions set `SERVERLESS_ACCESS_KEY` (org secret), `SERVERLESS_ORG=abstractplay`, plus `TOTP_KEY`, VAPID keys, and `OPENSSH_PRIVATE_KEY` from repository secrets.
- **Local:** Keep values in **`../apsecrets.yml`** (sibling of this repo, e.g. `ap/apsecrets.yml` next to `node-backend/`). That path is **outside** this git repository, so it cannot be committed here. [`serverless.yml`](../serverless.yml) uses `${env:VAR, file(../apsecrets.yml):key}` ï¿½ CI environment variables win when set; otherwise the CLI reads the file.

Expected keys in `../apsecrets.yml`: `totp_key`, `vapid_private_key`, `vapid_public_key`, `openssh_private_key`, `announcements_discord_webhook_url` (YAML snake_case; `openssh_private_key` is OpenSSH PEM text for bot webhook signing). For CI prod deploy, also set GitHub secret `ANNOUNCEMENTS_DISCORD_WEBHOOK_URL` (same webhook URL).

## Stage configuration

Per-stage settings live in `serverless.yml` under `custom.stageConfig`:

- Cognito user pool and app client (human players)
- Bot Cognito pool, token URL, OAuth scope
- SQS URLs (AiAi queue, WebSocket messages, bot outbound)
- WebSocket API domain

Table name: `abstract-play-${stage}`.

## REST API stage throttle

**Stage-wide** rate limiting (`/*/*`) is **not** part of the CloudFormation template Serverless generates (same pattern as Cognito pool trigger merges). Limits are declared in [`serverless.yml`](../serverless.yml) under `custom.apiGatewayStageThrottle` and applied after each API deploy (values must match `scripts/apply-api-gateway-stage-throttle.mjs`).

| Stage | Rate limit (RPS) | Burst |
|-------|------------------|-------|
| **prod** | 25 | 75 |
| **dev** | 2 | 6 |

Dev also uses lower Lambda caps: `query` reserved concurrency **10**, `authQuery` **15**, `botQuery` **5** (prod **50** / **75** / **10**).

**CI:** [deploy-prod](../.github/workflows/deploy-prod.js.yml) and [deploy-dev](../.github/workflows/deploy-dev.js.yml) each run `npm run apply-api-gateway-stage-throttle -- --stage <stage>` immediately after the API stack deploy.

**Manual (optional):** `npm run apply-api-gateway-stage-throttle -- --stage prod|dev [--dry-run]`

## REST API WAF (prod)

Prod associates a regional **AWS WAFv2** Web ACL with the REST API stage via CloudFormation (`resources.RestApiWebAcl` / `RestApiWebAclAssociation`, `IsProdStage` only). Dev is intentionally unwaf?d.

| Rule | Behaviour |
|------|-----------|
| **RateLimitPerIp** | Block when a source IP exceeds **2000 requests / 5 minutes** (aggregate on IP) |

Default action is **allow**; only the rate rule blocks. Complements prod stage throttle (global bucket) and per-IP fairness. WebSocket API and Cognito auth traffic are **not** covered by this ACL.

Expect **~$8?10/mo** at current prod request volume (ACL + rule + request metering). Watch **AWS/WAFV2** `BlockedRequests` and API Gateway **403** alongside existing **429** from stage throttle.

**Deploy IAM:** WAF is created by CloudFormation using the **CI IAM user** (`serverless-GitHub-actions`), not the Lambda execution role in `provider.iam.role`. Attach the account managed policy **`AbstractPlay-WAFHandling`** to that user in IAM (regional WAFv2 including tags). Do not model deploy-user IAM in the API CloudFormation stack ? CI cannot `iam:PutUserPolicy` on itself ([failed deploy 44604408924](https://github.com/AbstractPlay/node-backend/actions/runs/44604408924)).

## Public read rate limits (`query` Lambda)

Per-route, per-IP caps on selected open queries run inside **`runPublicQuery`** before handlers (DynamoDB fixed-window counters in the main table). They sit **under** WAF and stage throttle and return **429** with `{ "message": "Rate limit exceeded." }`.

| Layer | Scope |
|-------|--------|
| WAF (prod) | All REST, per IP |
| Stage throttle | Whole API stage |
| **Public read limits** | `user_names`, `get_public_exploration`, `recent_completed_games`, `standing_challenges`, `all_standing_challenges` |

Limits and window sizes are defined in [`lib/rateLimit/publicReadLimits.ts`](../lib/rateLimit/publicReadLimits.ts). Dev multiplies prod caps by **10**; set env **`PUBLIC_READ_RATE_LIMITS=0`** on the `query` Lambda to disable (fail-open on DynamoDB errors). CloudWatch: structured `public_query_rate_limited` / `rate_limit_fail_open` (`layer: public`) on deny or DDB blip. **Prod ops alarm** (when `OPS_ALERT_EMAIL` is set): `abstractplay-public-query-rate-limited-prod` fires on **? 30** denies in **5 minutes** (`AbstractPlay/RateLimits` metric from a log metric filter on the `query` log group).

## Auth write rate limits (`authQuery` Lambda)

Per-user (Cognito `sub`) caps on authenticated **writes** run in **`runAuthQuery`** before handlers (DynamoDB `RATELIMIT#auth#*` counters). Tiered scopes ? `auth_write_move`, `auth_write_exploration`, `auth_write_create`, `auth_write_comment`, plus **`auth_write_global`** backstop ? with read/admin exempt lists in [`lib/rateLimit/authWriteLimits.ts`](../lib/rateLimit/authWriteLimits.ts). Returns **429** with the same JSON as public reads. Dev multiplies prod caps by **10**; set **`AUTH_WRITE_RATE_LIMITS=0`** on `authQuery` to disable. CloudWatch: `auth_query_rate_limited` on deny; `rate_limit_fail_open` with `layer: auth` on DDB errors.

## WebSocket `$connect` auth and rate limits

**REQUEST authorizer** [`wsAuthorizer`](../api/sockets/wsAuthorizer.ts) on route `$connect` requires `?token=` (Cognito ID JWT). Per-IP caps use DynamoDB `RATELIMIT#ws#ws_connect#*` ([`wsConnectLimits.ts`](../lib/rateLimit/wsConnectLimits.ts)): prod **12 / 80 / 300** (minute/hour/day); dev **×10**. Disable caps with **`WS_CONNECT_RATE_LIMITS=0`**. WebSocket access logging stays **off** so tokens do not appear in API logs.

**Release:** deploy **API** and **front** together ? [`MyWebSocket.js`](https://github.com/AbstractPlay/front/blob/develop/src/components/MyWebSocket.js) appends `?token=` to `WS_ENDPOINT`. Without the front change, authorized users cannot connect after the authorizer ships.

## gameProjector stream (automatic in CI)

The DynamoDB table must have streams enabled **before** CloudFormation can reference `StreamArn`. The stream Lambda trigger is gated by the `enableGameProjectorStream` deploy parameter.

**CI** (`scripts/serverless-deploy.sh`) checks `LatestStreamArn` on the stage table before deploy:

- **No stream yet** ? `enableGameProjectorStream=false` (enables `StreamSpecification` on the table; deploys `gameProjector` Lambda without a trigger).
- **Stream exists** ? `enableGameProjectorStream=true` (creates `GameProjectorEventSourceMapping` + DLQ wiring).

So the **first** deploy to a new stage only enables streams. The **next** CI run on that stage attaches the mapping. No manual flags.

**Local manual deploy** (same two-step logic):

```bash
npm run build
bash scripts/serverless-deploy.sh dev AbstractPlayDev
# After first run succeeds, any later run passes enableGameProjectorStream=true automatically.
```

Once a stage has a stream, always deploy with `true` (or use the script) so CloudFormation does not remove the event source mapping.

## Ops alerts (email)

When `OPS_ALERT_EMAIL` is set at deploy time, CloudFormation creates an SNS topic (`abstractplay-ops-alerts-${stage}`) and wires the alarms below to it (some are prod-only; dev does not create the projector DLQ or DLQ alarm):

| Alarm | Signal |
|-------|--------|
| `abstractplay-game-projector-errors-${stage}` | Lambda `Errors` = 1 in 1 minute (catches init crashes) |
| `abstractplay-game-projector-dlq-${stage}` | DLQ depth = 1 message (**prod** only) |
| `abstractplay-game-projector-iterator-age-${stage}` | Stream `IteratorAge` > 5 minutes for 10 minutes |
| `abstractplay-public-query-rate-limited-prod` | **Prod only:** at least **30** `public_query_rate_limited` log lines in 5 minutes (sustained throttling / scraper) |
| `abstractplay-ses-bounce-rate-prod` / `abstractplay-ses-complaint-rate-prod` | SES reputation thresholds |

**First deploy:** SNS sends a subscription confirmation email ï¿½ you must click **Confirm subscription** once or alarms will not arrive.

**Local / manual deploy:**

```bash
export OPS_ALERT_EMAIL=you@example.com
bash scripts/serverless-deploy.sh prod AbstractPlayProd
```

Omit `OPS_ALERT_EMAIL` to skip the topic and alarm actions (dev deploys by default).

## Required GitHub secrets

- `SERVERLESS_ACCESS_KEY` ï¿½ Serverless Dashboard access key (org secret `abstractplay`)
- `AWS_KEY`, `AWS_SECRET` ï¿½ deploy credentials
- `PAT_READ_PACKAGES` ï¿½ npm install from GitHub Packages
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `TOTP_KEY`, `OPENSSH_PRIVATE_KEY`
- `OPS_ALERT_EMAIL` ï¿½ ops CloudWatch alarm notifications (prod workflow)
- `TEST_BOT_CLIENT_ID`, `TEST_BOT_CLIENT_SECRET` (dev workflow)
- `AIAI_BOT_ID_PROD` ï¿½ prod registered AiAi bot client id; passed to crons deploy as `AIAI_BOT_RECORDS_CANONICAL_ID` for records player-shard merge (same value as **bot-aiai** prod OAuth client id)

## Cognito setup (essentials)

Each stage needs a Cognito user pool with an app client for the front end:

1. Create a user pool (defaults are fine).
2. Add an app client ï¿½ **do not** generate a client secret.
3. Copy the pool ARN into `serverless.yml` (`custom.stageConfig.{stage}.userpool`) for the `authQuery` authorizer.
4. App client settings: enable identity providers; set callback/sign-out URLs (`http://localhost:3000` for local dev; `https://play.dev.abstractplay.com` / `https://play.abstractplay.com` for deployed front ends).
5. OAuth: Authorization code grant, Implicit grant, `openid` scope; enable `aws.cognito.signin.user.admin` and `Email`.

Bot pools are separate per stage ï¿½ see [Bots](/backend/subsystems/bots/).

## Documentation deploys

When a push to `develop` or `main` includes changes under `docs/` or `crons/docs/`, the deploy workflow dispatches `dep_update_dev` / `dep_update_prod` to the [docs](https://github.com/AbstractPlay/docs) repository so the site rebuilds (after the docs repo vendors this monorepo and syncs `/crons/` ï¿½ see `crons/docs/_docs-repo-integration.md`).

## Related

- [Getting started](/backend/getting-started/)
- [Architecture](/backend/architecture/)
