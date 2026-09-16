# Bot framework

Bots are independent programs hosted by players but integrated with Abstract Play servers. Each bot is a first-class player with its own id, profile, and Cognito machine-to-machine credentials.

Most bot framework code lives in this repository:

| Area | Location |
|------|----------|
| Owner API (create, update, delete) | [`lib/bots/crud.ts`](../../lib/bots/crud.ts) |
| Outbound webhooks (challenge, move) | [`lib/botOutbound.ts`](../../lib/botOutbound.ts), [`utils/bot-outbound.ts`](../../utils/bot-outbound.ts) |
| Signature verification (bot side) | [`lib/botVerify.ts`](../../lib/botVerify.ts) |
| OAuth + `botQuery` client (bot side) | [`lib/botClient.ts`](../../lib/botClient.ts) |
| Reference bot (dev) | [`api/testBot.ts`](../../api/testBot.ts) |

## Design principles

- **Owned by an active player** — the owner is shown on the bot's profile page.
- **Hosted on HTTPS** — your bot exposes an endpoint AP can reach.
- **Mostly stateless** — AP sends enough context in each webhook; bots should not rely on long-term stored game state.
- **Bidirectional JSON over HTTPS** — AP POSTs signed payloads to your bot; your bot POSTs moves to `/botQuery` with a Bearer token.

## Required capabilities

Your bot must:

1. **Ping** — respond to availability checks (`GET` → `200`).
2. **Challenge** — accept or reject challenges synchronously (`POST` → `200` or `400`).
3. **Move** — acknowledge turn notifications quickly (`POST` → `202`), then submit the move via `botQuery`.

## Traffic overview

```
Human challenges bot
  → authQuery new_challenge
  → SQS bot-outbound
  → bot-outbound Lambda POSTs signed challenge JSON to your HTTPS endpoint
  → your bot returns 200 (accept) or 400 (reject)
  → backend calls challenge_response on behalf of the bot

Bot's turn in a game
  → submit_move (human) or automove
  → SQS bot-outbound
  → bot-outbound Lambda POSTs signed move JSON to your endpoint
  → your bot returns 202 immediately
  → your bot POSTs { verb: "move", ... } to /botQuery with OAuth Bearer token
```

## Stages

Dev and prod are fully separate: Cognito bot pools, token URLs, OAuth scopes, DynamoDB tables, and `botQuery` base URLs. Register and test on **dev** first; create a new bot on **prod** for release. Credentials do not transfer.

| | Dev | Prod |
|---|-----|------|
| Token URL | `abstract-play-bots-dev.auth.us-east-1.amazoncognito.com/oauth2/token` | `https://botauth.abstractplay.com/oauth2/token` |
| OAuth scope | `default-m2m-resource-server-dev/communicate` | `default-m2m-resource-server-zssvzy/communicate` |
| `botQuery` | `…/dev/botQuery` | `…/prod/botQuery` |

Exact values are in [`serverless.yml`](../../serverless.yml) `custom.stageConfig`.

## Documentation

- [Authentication](/backend/bots/authentication/) — OAuth (bot → AP) and Ed25519 signatures (AP → bot)
- [Protocol](/backend/bots/protocol/) — ping, challenge, and move payloads
- [Registration](/backend/bots/registration/) — creating and managing bots via `authQuery`
- [Implementation guide](/backend/bots/implementation/) — reference bot, reusable libraries, adapting for production

## Legacy wiki

The original RFC remains at [abstractplay.com/wiki — rfcs:bots](https://abstractplay.com/wiki/doku.php?id=rfcs:bots). This `/backend/bots/` section is the maintained developer reference aligned with the code in this repo.
