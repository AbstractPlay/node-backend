# Getting started

## Prerequisites

- **Node.js 24** (matches `serverless.yml` runtime)
- **AWS CLI** with profiles `AbstractPlayDev` and `AbstractPlayProd` in `~/.aws/credentials`
- Access to the `@abstractplay` GitHub Packages scope

## Install and build

```bash
npm install
npm run build:layers   # required before deploy — builds gameslib Lambda layer
npm run build          # ESLint
npm test               # vitest (summarizeHelpers unit tests)
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
npm run build:layers
```

Or pin the dev tag (as CI does on `develop`):

```bash
npm i @abstractplay/gameslib@development
npm run build:layers
```

## Invoking a function locally

With AWS credentials configured for the target stage:

```bash
npm run run-records-pipeline -- --stage prod
```

Uses `bin/run-records-pipeline.mjs` (`aws lambda invoke`, 900s read timeout). Avoid `serverless invoke` for `records` / `summarize` — see [Records pipeline — manual run](/crons/pipeline/#manual-full-pipeline-run-records-pipeline).

Most batch functions expect prod S3 buckets and a completed DB dump. For code changes, prefer unit tests (`src/functions/summarizeHelpers.test.ts`) or invoke against dev stacks with caution — schedules are disabled on dev.

## Email strings (`apback`)

Canonical copy lives in repo-root [`locales/`](https://github.com/AbstractPlay/node-backend/tree/develop/locales) (Weblate). Crons Lambdas bundle those JSON files at build time via [`lib/apbackI18n.ts`](https://github.com/AbstractPlay/node-backend/blob/develop/lib/apbackI18n.ts) (`@backend/lib/apbackI18n.js` in handler imports).

`npm test` runs `pretest`, which fails if vendored `src/locales/*/apback.json` copies exist. Do not open translation-only PRs under `crons/`.

## Project layout

```
src/functions/     Lambda handlers (one file per function)
src/types/         Shared TypeScript types
scripts/           Repo tooling (layers build, ops helpers)
bin/               Local-only ops scripts (gitignored; not in CI)
serverless.yml     Function definitions and schedules
docs/              Developer documentation (published at /crons/)
```

## Next steps

- [Architecture](/crons/architecture/)
- [Deployment](/crons/deployment/)
- [Records pipeline](/crons/pipeline/)
