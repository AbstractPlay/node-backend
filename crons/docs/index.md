# Backend Crons

Scheduled AWS Lambda jobs for Abstract Play: DynamoDB exports, static game records on S3, site-wide analytics, and live tournament/challenge automation.

This repo complements [node-backend](/backend/) — the API writes live game state to DynamoDB; crons read that data (via daily exports or live queries) and publish derived artifacts to S3 and CloudFront.

## Documentation

- [Architecture](/crons/architecture/) — Serverless layout, schedules, layers, IAM
- [Getting started](/crons/getting-started/) — local setup, layers, invocation
- [Deployment](/crons/deployment/) — CI/CD, stages, upstream triggers
- [Records pipeline](/crons/pipeline/) — daily batch and summarize flow
- [Functions reference](/crons/functions/) — per-Lambda inputs, outputs, schedules
- [S3 outputs](/crons/s3-outputs/) — bucket keys and JSON shapes
- [Summarize](/crons/summarize/) — `_summary.json` metrics and rating logic
- [Live crons](/crons/live-crons/) — tournaments and standing challenges
- [Recommendation co-occurrence](/crons/recommendations-cooccur/) — `cooccur.json` for game recommendations
- [Recommendation analytics](/crons/recommendations-analytics/) — impression funnel rollups (private ops S3)

## Key resources

| Resource | Purpose |
|----------|---------|
| `abstractplay-db-dump` (S3) | DynamoDB point-in-time ION exports |
| `records.abstractplay.com` (S3 + CloudFront) | Published game records and analytics |
| `private-ops-153672715141-us-east-1-an` (S3) | Private ops artifacts (recommendation analytics) |
| `abstract-play-{stage}` (DynamoDB) | Live table (see [Database schema](/backend/database-schema/)) |

EventBridge schedules run in **prod only** (`scheduleEnabled.prod: true` in [`serverless.yml`](../serverless.yml)). Dev stacks deploy the Lambdas but crons do not fire on a schedule.

## Related docs

- [Backend](/backend/) — API, DynamoDB schema, subsystems
- [Gameslib](/gameslib/) — `GameFactory`, `gameinfo`, rules engine used by record generation
- [Recranks](/recranks/) — `APGameRecord` format and rating engines

*Last verified against `develop` branch.*
