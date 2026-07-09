# Bot protocol

AP communicates with bots over HTTPS. Your bot receives webhooks from AP and submits moves via `botQuery`.

## Ping (availability)

AP records bot health on the `BOT` DynamoDB record (`lastseen`, `lastStatusCode`, `operational`) whenever your endpoint is contacted.

| Direction | Method | Expected response |
|-----------|--------|-------------------|
| AP → bot | `GET` to your registered endpoint | `200` with `{ "operational": true }` recommended |

| Response | Meaning |
|----------|---------|
| `200` | Operational |
| Other 2xx/4xx/5xx | Reachable but not operational |
| Timeout / connection error | Unreachable |

The reference bot implements ping in [`api/testBot.ts`](../../api/testBot.ts) `handlePing()`.

## Challenge (synchronous)

When a human challenges your bot, AP enqueues a `bot-outbound` message. The worker POSTs a signed JSON body to your endpoint. You must respond **immediately** — do not queue challenge decisions.

| HTTP status | Meaning |
|-------------|---------|
| `200` | Accept |
| `400` | Explicit reject (unsupported game, busy, etc.) |
| Anything else | Treated as reject |

### Outbound payload (`out-challenge`)

Built by `buildOutChallengePayload()` in [`lib/botOutbound.ts`](../../lib/botOutbound.ts):

```json
{
  "verb": "challenge",
  "metaGame": "abande",
  "variants": ["size-5"],
  "clockStart": 72,
  "clockInc": 24,
  "clockMax": 168,
  "challengers": ["human-player-uuid"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `verb` | `"challenge"` | Discriminator |
| `metaGame` | string | Game uid (e.g. `abande`, `mvolcano`) |
| `variants` | string[] | Enabled variant codes |
| `clockStart` | number | Initial clock in **hours** |
| `clockInc` | number | Increment per move in **hours** |
| `clockMax` | number | Maximum clock in **hours** |
| `challengers` | string[] | AP ids of human players (excluding the bot) |

On `200`, the backend calls `botRespondToChallenge()` → `respondedChallenge()` to accept on the bot's behalf. On reject, the challenge is declined.

## Move (asynchronous)

When it is your bot's turn, AP POSTs game state. You must return **`202 Accepted` quickly** and process the move in the background.

### Outbound payload (`out-move`)

Built by `buildOutMovePayload()` in [`lib/botOutbound.ts`](../../lib/botOutbound.ts):

```json
{
  "verb": "move",
  "metaGame": "abande",
  "variants": [],
  "gameid": "uuid-of-game",
  "clockCurr": 48,
  "numPlayers": 2,
  "moves": [["a1", "b2"], ["c3"]],
  "context": []
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `verb` | `"move"` | yes | Discriminator |
| `metaGame` | string | yes | Game uid |
| `variants` | string[] | yes | Variant codes |
| `gameid` | string | yes | Game uuid in DynamoDB |
| `clockCurr` | number | yes | Bot's remaining clock in **hours** (derived from ms in game record) |
| `numPlayers` | number | yes | Player count |
| `moves` | string[][] | yes | Move history: array of rounds, each round an array of moves in turn order |
| `context` | object[] | no | Extra state for random setups, dice, hands, etc. (from `engine.botContext()` when defined) |

### Inbound payload (`in-move`)

POST to `/botQuery` with your OAuth Bearer token:

```json
{
  "verb": "move",
  "gameid": "uuid-of-game",
  "metaGame": "abande",
  "move": "d4"
}
```

| Field | Type | Required |
|-------|------|----------|
| `verb` | `"move"` | yes |
| `gameid` | string | yes |
| `metaGame` | string | yes |
| `move` | string | yes |

| Response | Meaning |
|----------|---------|
| `200` | Move accepted; body contains updated game JSON |
| Other | Move failed — log and alert; AP will not retry automatically |

Reference flow: [`api/testBot.ts`](../../api/testBot.ts) `handleMove()` → `submitBotMove()` in [`lib/botClient.ts`](../../lib/botClient.ts).

## Move history format

`moves` is a list of **rounds**. Each round contains one move string per player in seat order. To reconstruct position, instantiate `GameFactory(metaGame, undefined, variants)` and replay rounds in order — see `pickMove()` in `testBot.ts`.

## JSON schemas (wiki)

Formal JSON Schema definitions were published in the [wiki RFC](https://abstractplay.com/wiki/doku.php?id=rfcs:bots). The payloads above match what [`lib/botOutbound.ts`](../../lib/botOutbound.ts) sends today.

## Related

- [Authentication](/backend/bots/authentication/)
- [Bot queries](/backend/api/bot-queries/)
- [Implementation guide](/backend/bots/implementation/)
