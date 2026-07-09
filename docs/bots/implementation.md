# Bot implementation guide

This page maps the protocol to concrete code in **node-backend**. Use it when building or debugging a bot integration.

## Quick start

1. Read [Bot framework](/backend/bots/), [Authentication](/backend/bots/authentication/), and [Protocol](/backend/bots/protocol/).
2. Study [`api/testBot.ts`](../../api/testBot.ts) — the complete reference bot (dev stage only).
3. Reuse [`lib/botVerify.ts`](../../lib/botVerify.ts) and [`lib/botClient.ts`](../../lib/botClient.ts) in your deployment.
4. Register on **dev** via `create_bot`, point `endpoint` at your HTTPS server, challenge the bot from the dev site.

## Reference bot (`api/testBot.ts`)

Deployed as the `testBot` Lambda when `testBotEnabled.dev` is true in [`serverless.yml`](../../serverless.yml).

| Route | Handler | Purpose |
|-------|---------|---------|
| `GET /testBot` | `handlePing()` | Availability check |
| `POST /testBot` | `handlePost()` | Signed challenge and move webhooks |

`handlePost()` flow:

1. Read raw body string.
2. `verifyBotRequest(rawBody, headers)` from `lib/botVerify.ts`.
3. Parse JSON; branch on `verb`:
   - `challenge` → accept/reject based on test settings → `200` / `400`
   - `move` → return `202`, then async: `pickMove()` → `submitBotMove()`

`pickMove()` replays `moves` through `GameFactory` and plays the first legal move (or `pass`). Replace this with your engine.

### Dev dashboard

`test_bot_status` and `update_test_bot` auth queries expose recent webhook events and settings (`acceptChallenges`, `rejectMetaGames`, `movePolicy`, `moveDelayMs`). These are **not** part of the production bot contract.

## Reusable libraries

| Module | Use on | Purpose |
|--------|--------|---------|
| [`lib/botVerify.ts`](../../lib/botVerify.ts) | Your server | Verify AP webhook signatures |
| [`lib/botClient.ts`](../../lib/botClient.ts) | Your server | OAuth token cache + `botQuery` move submission |
| [`lib/botOutbound.ts`](../../lib/botOutbound.ts) | AP backend | Build payloads, sign, POST to bots |
| [`lib/botSigning.ts`](../../lib/botSigning.ts) | AP backend | Ed25519 signing for outbound webhooks |
| [`lib/botSecrets.ts`](../../lib/botSecrets.ts) | AP backend | Cognito secret rotation |
| [`lib/botCognito.ts`](../../lib/botCognito.ts) | AP backend | Create bot Cognito clients |
| [`lib/botNames.ts`](../../lib/botNames.ts) | AP backend | Display name reservation |

## AP-side delivery pipeline

```
abstractplay.ts
  newChallenge / submitMove / notifyRegisteredBotsTurn
    → enqueueBotOutbound({ type: 'challenge' | 'move', ... })
      → SQS BotOutboundQueue
        → utils/bot-outbound.ts handler
          → processBotChallengeMessage / processBotMoveMessage
            → postToBot() with signed body
```

Challenge acceptance triggers `botRespondToChallenge()` → `respondedChallenge()` in `abstractplay.ts`.

## Adapting for production

1. **Host any HTTPS server** — Lambda, Cloud Run, VPS, etc.
2. **Implement GET ping** — return `200` and `{ "operational": true }`.
3. **Implement signed POST handler** — verify signatures before parsing JSON.
4. **Challenge** — return `200` or `400` synchronously; no background work.
5. **Move** — return `202` within the timeout (30s on AP's `postToBot`); compute move asynchronously; call `botQuery`.
6. **Register** with `create_bot`; store `clientId` / `clientSecret` securely.
7. **Test on dev** before creating a prod bot.

## Environment variables (your bot)

| Variable | Purpose |
|----------|---------|
| `BOT_TOKEN_URL` | OAuth token endpoint for your stage |
| `BOT_OAUTH_SCOPE` | Scope string for `client_credentials` grant |
| `BOT_QUERY_URL` | Full URL to `/botQuery` for your stage |
| `AP_BOT_PUBLIC_KEY` | Optional override for signature verification |

The test bot Lambda also uses `TEST_BOT_CLIENT_ID`, `TEST_BOT_CLIENT_SECRET`, and `ABSTRACT_PLAY_TABLE`.

## Environment variables (AP backend)

Set in [`serverless.yml`](../../serverless.yml): `BOTPOOL_ID`, `BOT_TOKEN_URL`, `BOT_OAUTH_SCOPE`, `BOT_QUERY_URL`, `BOT_OUTBOUND_QUEUE_URL`, `OPENSSH_PRIVATE_KEY` (signing key for outbound webhooks).

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `401` on `botQuery` before Lambda runs | Token missing OAuth scope; compare `BOT_OAUTH_SCOPE` with API Gateway bot authorizer |
| Signature verification fails | Using parsed/re-serialized JSON instead of raw body |
| Challenge never accepted | Bot returned non-200/400; check `BOT.lastStatusCode` |
| Bot never moves | Bot did not return `202` on move webhook, or `botQuery` failed silently |
| Dev bot works, prod does not | Separate credentials and endpoints per stage |

## Related

- [Registration](/backend/bots/registration/)
- [Protocol](/backend/bots/protocol/)
- [Bots subsystem](/backend/subsystems/bots/) — short overview
- [Database schema](/backend/database-schema/) — `BOT`, `BOTNAME`
