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
serverless invoke -f summarize --stage prod
serverless invoke -f records --stage prod
```

Most batch functions expect prod S3 buckets and a completed DB dump. For code changes, prefer unit tests (`src/functions/summarizeHelpers.test.ts`) or invoke against dev stacks with caution — schedules are disabled on dev.

## Email strings (`apback`)

Canonical copy lives in [node-backend `locales/`](https://github.com/AbstractPlay/node-backend/tree/develop/locales) (Weblate). Lambdas import `src/locales/*/apback.json`, but those files are **not committed** (like generated assets elsewhere in the monorepo workflow).

**Local:** clone node-backend as a sibling (`../node-backend`) or set `NODE_BACKEND_ROOT`, then:

```bash
npm run sync-apback-locales
```

`npm test` runs `pretest`, which syncs automatically when `src/locales/` is missing.

**CI / deploy:** workflows check out node-backend and run `sync-apback-locales` before build, test, and Serverless deploy. Do not open translation-only PRs here.

## Project layout

```
src/functions/     Lambda handlers (one file per function)
src/types/         Shared TypeScript types
src/locales/       Generated apback JSON (see README there; sync from node-backend)
scripts/           Repo tooling (layers build, locale sync, ops helpers)
bin/               Local-only ops scripts (gitignored; not in CI)
serverless.yml     Function definitions and schedules
docs/              Developer documentation (published at /crons/)
```

## Next steps

- [Architecture](/crons/architecture/)
- [Deployment](/crons/deployment/)
- [Records pipeline](/crons/pipeline/)
