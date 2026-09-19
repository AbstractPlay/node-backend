# Architecture

## Overview

[backend-crons](https://github.com/AbstractPlay/backend-crons) is a Serverless Framework v3 service (`abstract-play-backend-crons`) deployed to AWS `us-east-1`. All functions are Node.js 20 Lambdas triggered by EventBridge cron rules (prod only).

There is no API Gateway — these are batch and maintenance jobs only.

## Lambda functions

Defined in [`serverless.yml`](../serverless.yml). Schedules are **daily** unless noted (EventBridge `cron(0 H * * ? *)` = every day at hour H UTC).

| Function | Schedule (UTC, prod) | Role |
|----------|----------------------|------|
| `dumpdb` | Daily 00:00 | Export prod DynamoDB to S3 |
| `records` | Daily 03:00 | Build game records from dump |
| `records-ttm` | Daily 03:00 | Per-player time-to-move arrays |
| `records-move-times` | Daily 03:00 | Move activity histograms |
| `records-cooccur` | Daily 03:00 | PMI co-occurrence for recommendations |
| `records-rec-analytics` | Daily 03:00 | Recommendation impression funnel analytics (ops S3) |
| `tournament-data` | Daily 03:00 | Tournament summaries from dump |
| `records-manifest` | Daily 04:00 and 07:30 | S3 listing + `_manifest.json` v2 |
| `summarize` | Daily 06:00 | Site analytics from `ALL.json` |
| `player-summary-fanout` | Daily 06:15 | SQS fan-out for `player/*-summary.json` |
| `player-summary-worker` | SQS-triggered | Writes one player summary slice per message |
| `starttournaments` | Daily 10:00 and 22:00 | Start/cancel tournaments, create games |
| `standingchallenges` | Daily 00:00 and 12:00 | Process preset standing challenges |

See [Records pipeline](/crons/pipeline/) and [Functions reference](/crons/functions/) for details.

## Gameslib Lambda layer

Functions that call `@abstractplay/gameslib` attach the `abstractplayGameslib` layer, built by [`scripts/build-layers.mjs`](https://github.com/AbstractPlay/backend-crons/blob/develop/scripts/build-layers.mjs) before packaging:

- Bundles `@abstractplay/gameslib` and `@abstractplay/recranks` into `.serverless/layers/abstractplay-gameslib`
- Strips `@abstractplay/renderer` (transitive dep, not needed at runtime)
- Prunes docs and tests from the layer to stay under Lambda size limits; retains gameslib `locales/en/` for variant name resolution during record generation

esbuild marks `@abstractplay/gameslib` and `@abstractplay/recranks` as **external** so they resolve from the layer at runtime, not from the function bundle.

## Data flow

```mermaid
flowchart LR
    ddb[(DynamoDB abstract-play-prod)] --> dumpdb
    dumpdb --> s3dump[(S3 abstractplay-db-dump)]
    s3dump --> records
    s3dump --> cooccur[records-cooccur]
    records --> s3rec[(S3 records.abstractplay.com)]
    cooccur --> s3rec
    s3rec --> summarize
    summarize --> s3rec
    ddb --> live[Live crons]
    ddb --> recanalytics[records-rec-analytics]
    recanalytics --> s3ops[(private ops S3)]
    live --> ddb
    s3rec --> cf[CloudFront CDN]
```

## IAM permissions

The service role grants:

- **DynamoDB** — query/scan/get/put/update/delete, batch write, point-in-time export
- **S3** — list/get on `abstractplay-db-dump`; put on `records.abstractplay.com` and dump bucket; get/put on private ops bucket (`recommendations/analytics/*`)
- **SES** — send email (tournament notifications)
- **CloudFront** — gzip + cache headers on records CDN (see [S3 outputs](/crons/s3-outputs/#cloudfront-and-caching)); no blanket invalidation

## Environment

| Variable | Source | Purpose |
|----------|--------|---------|
| `ABSTRACT_PLAY_TABLE` | `serverless.yml` | `abstract-play-{stage}` — used by `summarize` (geo stats), live crons, and `records-rec-analytics` |

## Dependencies

| Package | Used by | Purpose |
|---------|---------|---------|
| `@abstractplay/gameslib` | records, records-ttm, records-move-times, summarize, player-summary-fanout, rating-change-notifications, starttournaments | `GameFactory`, `gameinfo`, `genRecord`, `addResource` |
| `@abstractplay/recranks` | records, summarize | `APGameRecord`, ELO/Glicko2/Trueskill raters |
| `ion-js`, `fflate` | dump consumers | Parse gzipped ION export files |
| `i18next` | starttournaments, inactive-challenge-cleanup, records/thumbnails (gameslib labels) | Vendored `apback` email/push copy; gameslib bundles for meta-game names |

`records-cooccur` uses `ion-js` and `fflate` only (no gameslib layer).

## Project layout

```
src/functions/     Lambda handlers
src/types/         Record and StatSummary TypeScript types
src/locales/       Generated apback JSON (CI/local sync from node-backend; not committed)
src/utils/         Shared utilities (e.g. isoToCountryCode, cooccurPmi)
scripts/           build-layers.mjs, locale sync/check, operator helpers
serverless.yml     Infrastructure and schedules
```

## Related

- [Getting started](/crons/getting-started/)
- [Deployment](/crons/deployment/)
- [Backend architecture](/backend/architecture/)
