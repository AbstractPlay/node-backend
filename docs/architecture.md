# Architecture

## Request routing

The API uses an RPC-style envelope rather than REST resources. Clients POST (or GET for some public queries) a `query` name and a `pars` object.

| Endpoint | Auth | Handler | Purpose |
|----------|------|---------|---------|
| `/query` | None | `module.exports.query` | Public reads, schedulers, maintenance |
| `/authQuery` | Cognito user JWT | `module.exports.authQuery` | Player actions and authenticated reads |
| `/botQuery` | Cognito M2M (bot pool) | `module.exports.botQuery` | Bots submit moves |

Source of truth for query names: switch statements in [`api/abstractplay.ts`](../api/abstractplay.ts).

## Lambda functions

Defined in [`serverless.yml`](../serverless.yml):

| Function | Trigger | Role |
|----------|---------|------|
| `query` | API Gateway HTTP | Public queries |
| `authQuery` | API Gateway HTTP + Cognito authorizer | Authenticated queries |
| `botQuery` | API Gateway HTTP + bot pool authorizer | Bot move submission |
| `connect` | WebSocket `$connect` | Register connection |
| `disconnect` | WebSocket `$disconnect` | Remove connection |
| `subscribe` | WebSocket `subscribe` route | Authenticate and subscribe to topics |
| `messageHandler` | SQS `ws-messages` queue | Broadcast WebSocket messages |
| `yourturn` | EventBridge cron (14:00 and 22:00 UTC) | Batch "your turn" emails |
| `bot-outbound` | SQS `bot-outbound` queue | HTTPS webhooks to external bots |
| `testBot` | API Gateway HTTP (dev only) | Reference bot implementation |

## Data store

- **Table:** `abstract-play-{stage}` (single-table design)
- **Region:** `us-east-1`
- **Schema:** [Database schema](/backend/database-schema/)

## Dependencies

- **`@abstractplay/gameslib`** — game rules, `GameFactory`, move validation, `gameinfo`
- **`@abstractplay/renderer`** — transitive dependency of gameslib
- **AWS SDK** — DynamoDB, SES, SQS, Cognito Identity Provider
- **`web-push`** — browser push notifications

## Key modules

| Module | Responsibility |
|--------|----------------|
| [`api/abstractplay.ts`](../api/abstractplay.ts) | Main API logic (~10k lines) |
| [`lib/ddb.ts`](../lib/ddb.ts) | Shared DynamoDB document client |
| [`lib/participants.ts`](../lib/participants.ts) | Human vs bot identity, `BOT` records |
| [`lib/botOutbound.ts`](../lib/botOutbound.ts) | Enqueue and deliver bot webhooks |
| [`lib/botSecrets.ts`](../lib/botSecrets.ts) | Bot Cognito client secret rotation |
| [`lib/botCognito.ts`](../lib/botCognito.ts) | Create bot Cognito app clients |
| [`lib/botNames.ts`](../lib/botNames.ts) | `BOTNAME` reservation |
| [`lib/wsBroadcast.ts`](../lib/wsBroadcast.ts) | Queue WebSocket fan-out |
| [`api/sockets/`](../api/sockets/) | WebSocket connect/disconnect/subscribe handlers |
| [`api/testBot.ts`](../api/testBot.ts) | Reference bot (dev only) |
| [`utils/yourturn.ts`](../utils/yourturn.ts) | Scheduled notification job |

## Side effects

Authenticated handlers may also call:

- **SES** — challenge, game end, your-turn emails
- **SQS** — WebSocket message queue, bot outbound queue
- **Cognito** — bot client create/delete/secret rotation
- **CloudFront** — record invalidation (some maintenance paths)

## Stages

Dev and prod are separate stacks with separate Cognito pools, DynamoDB tables, and bot credentials. Dev tokens and bot credentials do not work against prod.

See [Deployment](/backend/deployment/) for branch mapping and CI.
