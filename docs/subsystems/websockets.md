# WebSockets

## Overview

Real-time updates (game moves, chat, dashboard refreshes) use API Gateway WebSockets plus an SQS-backed broadcaster.

## Connection flow

1. Client opens WebSocket to the stage API (`wss://…/{stage}`).
2. **`$connect`** — [`connectHandler`](../../api/sockets/connectHandler.ts) stores connection id under `wsConnections`.
3. **`subscribe`** — [`authHandler`](../../api/sockets/authHandler.ts) validates the user and subscribes the connection to topics (e.g. user id, game id).
4. **`$disconnect`** — [`disconnectHandler`](../../api/sockets/disconnectHandler.ts) removes the connection record.

## Broadcasting

[`lib/wsBroadcast.ts`](../../lib/wsBroadcast.ts) enqueues messages to `WEBSOCKET_SQS`. The `messageHandler` Lambda reads the queue and posts to active connections via API Gateway Management API.

## Record type

```
pk: wsConnections
sk: <connectionId>
```

## Configuration

Per-stage WebSocket domain and SQS URL are in `serverless.yml` (`WEBSOCKET_DOMAIN`, `WEBSOCKET_SQS`, `WEBSOCKET_STAGE`).

## Related

- [Architecture](/backend/architecture/)
- [Database schema](/backend/database-schema/)
