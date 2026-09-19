# Deployment

Crons deploy from the [node-backend](https://github.com/AbstractPlay/node-backend) monorepo (`crons/` directory). CI and manual deploys always run the **API stack first**, then this stack.

## Automatic deploys

Same GitHub Actions workflows as the API ([`deploy-dev.js.yml`](../../.github/workflows/deploy-dev.js.yml), [`deploy-prod.js.yml`](../../.github/workflows/deploy-prod.js.yml)):

| Step | Command |
|------|---------|
| API | `bash bin/serverless-deploy.sh <stage> <profile>` |
| Crons | `bash crons/scripts/serverless-deploy.sh <stage>` |

| Branch / trigger | Stage |
|------------------|-------|
| `develop` push | `dev` |
| `main` push | `prod` |
| `repository_dispatch` `dep_update_*` | matching stage |

Gameslib (and similar) should dispatch **`dep_update_*` only to node-backend** — both stacks redeploy from one workflow.

PR CI: [`.github/workflows/test.yml`](../../.github/workflows/test.yml) job **`test-crons`** runs `lint:crons`, `test:crons`, and `test:crons:layers`.

## AP dependency pins

Pins live in **`crons/ci-deps.dev.json`** and **`crons/ci-deps.prod.json`**, kept in sync with the root lockfile by `node scripts/sync-crons-ap-deps.mjs` (chained from root `npm run sync-deps` / `npm run sync-deps:prod`).

Do not run `ap-install-deps` from `crons/` alone in a workspace checkout — use root `npm run sync-deps`.

## Manual deploy

From repo root (after API deploy):

```bash
npm run build -w abstractplay-backend-crons   # eslint in crons/
npm run test:crons:layers                     # optional but recommended
bash crons/scripts/serverless-deploy.sh dev   # or prod
```

Or from `crons/`:

```bash
cd crons
npm run build
npm run test:layers
npx serverless deploy --stage dev
```

AWS profile comes from `params` in [`serverless.yml`](../serverless.yml) (`AbstractPlayDev` / `AbstractPlayProd`).

## Schedules

EventBridge cron rules are **enabled only on prod** (`custom.scheduleEnabled.prod: true`). Dev stacks contain the Lambdas but scheduled invocations are off.

## Ops alerts (email)

On **prod**, CloudWatch alarms in this stack publish to the SNS topic exported by the API stack (`abstract-play-prod-OpsAlertsTopicArn`). Confirm the ops-alerts email subscription via [node-backend deployment](/backend/deployment/#ops-alerts-email).

## Documentation site

Cron docs live in `crons/docs/` and publish under `/crons/` on the [docs site](https://docs.abstractplay.com). The [AbstractPlay/docs](https://github.com/AbstractPlay/docs) prebuild syncs `vendor/node-backend/crons/docs` (no separate `backend-crons` submodule). Maintainer checklist: [`_docs-repo-integration.md`](https://github.com/AbstractPlay/node-backend/blob/develop/crons/docs/_docs-repo-integration.md).

## Related

- [Pipeline](/crons/pipeline/)
- [Backend deployment](/backend/deployment/)
