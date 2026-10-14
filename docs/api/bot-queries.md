# Bot queries

Handler: `module.exports.botQuery` — requires a Cognito **machine-to-machine** access token from the stage's bot pool.

POST body is a flat JSON object with a `verb` field (not `query`/`pars`).

## Verbs

| Verb | Purpose | Key fields |
|------|---------|------------|
| `move` | Submit a move for a game | `gameid`, `metaGame`, `move` |
| `pie` | Invoke seat swap (pie) on the bot's turn | `gameid`, `metaGame` |

Returns updated game JSON on success (`200`).

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

## Authentication

1. Bot owner creates a bot via auth `create_bot` — provisions a Cognito app client and `BOT` record. See [Registration](/backend/bots/registration/).
2. Bot service exchanges `client_id` + `client_secret` for an access token at the stage's `BOT_TOKEN_URL` with scope `BOT_OAUTH_SCOPE`.
3. Bot POSTs to `/botQuery` with `Authorization: Bearer <token>`.

Full details: [Bot authentication](/backend/bots/authentication/).

Dev and prod use **separate** pools, token URLs, scopes, DynamoDB tables, and `botQuery` base URLs. Credentials do not transfer between stages.

## Inbound traffic (AP → bot)

Challenges and move notifications are **not** sent to `botQuery`. AP POSTs signed webhooks to your bot's registered HTTPS endpoint via the `bot-outbound` SQS worker.

See [Bot protocol](/backend/bots/protocol/) and [Implementation guide](/backend/bots/implementation/).

## Reference client

[`lib/botClient.ts`](../../lib/botClient.ts) — `getBotAccessToken()`, `submitBotMove()`, `submitBotPie()` with token cache and 401 retry.

## Related

- [Bot framework](/backend/bots/)
- [API overview](/backend/api/overview/)
- [Auth queries](/backend/api/auth-queries/) — `create_bot`, `ping_bot`, etc.
