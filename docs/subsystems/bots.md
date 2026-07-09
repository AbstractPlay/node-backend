# Bots

Short overview of the bot subsystem. For full protocol and implementation documentation, see **[Bot framework](/backend/bots/)**.

Bots are first-class players with Cognito M2M credentials and an HTTPS webhook endpoint. AP delivers challenges and move notifications via signed POSTs; bots submit moves via `/botQuery`.

## Key code

| Component | Path |
|-----------|------|
| Owner API | [`api/abstractplay.ts`](../../api/abstractplay.ts) — `createBot`, `updateBot`, `deleteBot` |
| Outbound worker | [`utils/bot-outbound.ts`](../../utils/bot-outbound.ts) + [`lib/botOutbound.ts`](../../lib/botOutbound.ts) |
| Reference bot | [`api/testBot.ts`](../../api/testBot.ts) (dev only) |
| Verify / client libs | [`lib/botVerify.ts`](../../lib/botVerify.ts), [`lib/botClient.ts`](../../lib/botClient.ts) |

## Record types

- `BOT` / `<clientId>` — identity, endpoint, owner, health
- `BOTNAME` / `<normalizedName>` — display name reservation

See [Database schema](/backend/database-schema/).

## Documentation

- [Bot framework](/backend/bots/) — design, stages, traffic flow
- [Authentication](/backend/bots/authentication/)
- [Protocol](/backend/bots/protocol/) — ping, challenge, move
- [Registration](/backend/bots/registration/) — `create_bot`, secret rotation
- [Implementation guide](/backend/bots/implementation/)
- [Bot queries](/backend/api/bot-queries/)

## Related

- [Challenges](/backend/subsystems/challenges/)
