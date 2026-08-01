# WebSockets

## Overview

Real-time updates (game moves, presence) use API Gateway WebSockets plus SQS-backed broadcasters. Game events are targeted to connections that subscribe via `watchGames`; presence uses debounced sequenced deltas with snapshot/resync.

## Connection flow

1. Client opens WebSocket to the stage API (`wss://…/{stage}`).
2. **`$connect`** — [`connectHandler`](../../api/sockets/connectHandler.ts) is a no-op; connections are registered on subscribe.
3. **`subscribe`** — [`authHandler`](../../api/sockets/authHandler.ts) validates the JWT, stores the connection under `wsConnections` (optionally including `watchingGames` from a `games: [{ meta, id }]` array in the same message), sends a direct **presence snapshot** to that connection, and enqueues a debounced join event (skipped for `invisible: true`).
4. **`watchGames`** — [`watchGamesHandler`](../../api/sockets/watchGamesHandler.ts) replaces the connection's `watchingGames` set from `{ games: [{ meta, id }] }`. Used for incremental updates after subscribe (e.g. navigation, dashboard changes).
5. **`syncPresence`** — [`syncPresenceHandler`](../../api/sockets/syncPresenceHandler.ts) responds with a fresh presence snapshot (no seq increment).
6. **`$disconnect`** — [`disconnectHandler`](../../api/sockets/disconnectHandler.ts) removes the connection and enqueues a debounced leave event.

Clients that support targeted game delivery send `watchVersion: 1` on subscribe. Clients may include `games` on subscribe so `watchingGames` is written atomically with the connection record; they should still send `watchGames` on navigation or when the dashboard game list changes.

## Game broadcasting

[`lib/wsBroadcast.ts`](../../lib/wsBroadcast.ts) enqueues `{ verb, payload, exclude }` to `WEBSOCKET_SQS`. [`messageHandler`](../../api/sockets/messageHandler.ts) paginates connections, reuses one API Gateway Management API client per endpoint, and for `game`/`chat`:

- Sends only if `watchingGames` contains `${meta}#${id}`
- **Legacy fallback:** connections without `watchVersion: 1` and without `watchingGames` still receive all game events (remove after frontend rollout)

## Presence

Join/leave events from subscribe/disconnect go to `PresenceCoalesceQueue` (2s batching window). [`presenceBroadcaster`](../../api/sockets/presenceBroadcaster.ts) merges the batch, increments `wsMeta` / `presenceSeq`, and broadcasts a **delta** to connections with `wantsPresence !== false`.

Message shapes (`verb: "connections"`):

```json
{ "type": "snapshot", "seq": 42, "totalCount": 10, "visibleUserIds": ["…"] }
{ "type": "delta", "seq": 43, "joins": ["…"], "leaves": ["…"] }
```

Snapshots are sent directly on subscribe and on `syncPresence`. Deltas are debounced ~2s.

## Record types

**WebSocket connection** (`wsConnections`):

| Field | Purpose |
|---|---|
| `userId`, `invisible`, `endpoint` | User and API GW endpoint |
| `watchingGames` | String set of `metaGame#gameId` keys |
| `wantsPresence` | Default `true`; receive presence updates |
| `watchVersion` | `1` when client uses targeted watch + strict filtering |
| `ttl` | Unix epoch; refreshed on subscribe/watch (24h) |

**Presence sequence** (`wsMeta` / `presenceSeq`):

| Field | Purpose |
|---|---|
| `seq` | Monotonic counter incremented on each presence delta flush |

## Configuration

Per-stage WebSocket domain and SQS URLs are in `serverless.yml` (`WEBSOCKET_DOMAIN`, `WEBSOCKET_SQS`, `PRESENCE_COALESCE_SQS`, `WEBSOCKET_STAGE`).

## Deploy order

1. Deploy **backend** (legacy game fan-out fallback remains for old clients).
2. Deploy **frontend** (`watchVersion: 1`, `watchGames`, presence delta handling).
3. After verification, remove legacy fan-out in `messageHandler` (`isLegacyGameFanout` branch).

## Related

- [Architecture](/backend/architecture/)
- [Database schema](/backend/database-schema/)
