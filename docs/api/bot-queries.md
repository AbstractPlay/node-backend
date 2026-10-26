# Bot queries

Handler: `module.exports.botQuery` — requires a Cognito **machine-to-machine** access token from the stage's bot pool.

POST body is a flat JSON object with a `verb` field (not `query`/`pars`).

## Verbs

| Verb | Purpose | Key fields |
|------|---------|------------|
| `move` | Submit a move for a game | `gameid`, `metaGame`, `move` |
| `pie` | Invoke seat swap (pie) on the bot's turn | `gameid`, `metaGame` |
| `pingOwner` | Notify the bot owner (in-app) of an internal error | `message`; optional `gameid` + `metaGame` (both or neither) |

Returns updated game JSON on success (`200`) for `move` and `pie`. `pingOwner` returns `{ "notified": true }` or `{ "notified": false, "reason": "rate_limited" }` (still HTTP `200` when rate-limited).

When `move` or `pie` fails after turn validation, AP notifies the bot owner and posts a system in-game chat message (deduped per game). Turn-gate errors (for example not the bot's turn) do not alert the owner.

Example (`move`):

```json
{
  "verb": "move",
  "gameid": "uuid-of-game",
  "metaGame": "abande",
  "move": "d4"
}
```

Example (`pie` — games with the `pie` or `pie-even` flag, same turn rules as `move`):

```json
{
  "verb": "pie",
  "gameid": "uuid-of-game",
  "metaGame": "dagnacht"
}
```

Engines that report a **Swap** action (for example AiAi) should call `pie`, not `move` with `move: "Swap"`. Human players use auth `invoke_pie`; bots use this verb.

Example (`pingOwner` — optional escape hatch for crashes or logic errors your service detects locally; rate-limited per bot):

```json
{
  "verb": "pingOwner",
  "message": "Java think process exited with code 1",
  "gameid": "uuid-of-game",
  "metaGame": "amazons"
}
```

## Authentication

1. Bot owner creates a bot via auth `create_bot` — provisions a Cognito app client and `BOT` record. See [Registration](/backend/bots/registration/).
2. Bot service exchanges `client_id` + `client_secret` for an access token at the stage's `BOT_TOKEN_URL` with scope `BOT_OAUTH_SCOPE`.
3. Bot POSTs to `/botQuery` with `Authorization: Bearer <token>`.

Full details: [Bot authentication](/backend/bots/authentication/).

Dev and prod use **separate** pools, token URLs, scopes, DynamoDB tables, and `botQuery` base URLs. Credentials do not transfer between stages.

## Inbound traffic (AP ? bot)

Challenges and move notifications are **not** sent to `botQuery`. AP POSTs signed webhooks to your bot's registered HTTPS endpoint via the `bot-outbound` SQS worker.

See [Bot protocol](/backend/bots/protocol/) and [Implementation guide](/backend/bots/implementation/).

## Reference client

[`lib/botClient.ts`](../../lib/botClient.ts) — `getBotAccessToken()`, `submitBotMove()`, `submitBotPie()`, `submitBotPingOwner()` with token cache and 401 retry.

## Related

- [Bot framework](/backend/bots/)
- [API overview](/backend/api/overview/)
- [Auth queries](/backend/api/auth-queries/) — `create_bot`, `ping_bot`, etc.
