# Backend Crons

This tree lives in the [node-backend](https://github.com/AbstractPlay/node-backend) monorepo (`crons/`). Deploy with `serverless` from this directory after the main API stack (see `docs/deployment.md`).

The standalone [backend-crons](https://github.com/AbstractPlay/backend-crons) GitHub repo is archived (history only); do not open PRs there.

Scheduled AWS Lambda jobs for Abstract Play: DynamoDB exports, static game records on S3, site-wide analytics, and live tournament/challenge automation.

Developer documentation: [Abstract Play docs — Crons](https://docs.abstractplay.com/crons/) (dev: `docs.dev.abstractplay.com`).
