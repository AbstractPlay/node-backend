# Database schema

All data lives in one DynamoDB table per stage (`abstract-play-dev`, `abstract-play-prod`). The partition key (`pk`) names a logical record family; the sort key (`sk`) scopes items within that family.

Most access patterns use `Query` on `pk` with optional `begins_with` on `sk`. See subsystem pages for how each family is read and written.

## Games

- **Games** — full game state
  - pk: `GAME`
  - sk: `<metaGame>#<completedbit>#<gameid>`

- **Game comments** — chat for a game
  - pk: `GAMECOMMENTS`
  - sk: `<gameid>`

- **Notes** — per-user notes on a game
  - pk: `NOTE`
  - sk: `<gameId>#<userid>`

## Users

- **Users** — profile, settings, dashboard game/challenge lists
  - pk: `USER`
  - sk: `<userid>`

- **Push subscriptions** — web push endpoints (one record per browser/device)
  - pk: `PUSH`
  - sk: `<userid>#<subscriptionKey>` (`subscriptionKey` = first 16 hex chars of SHA-256 of `payload.endpoint`)
  - fields: `payload`, `endpoint`, `updatedAt`
  - legacy: `sk: <userid>` (migrated on next `save_push` or removed on 404/410)

- **User list** — public directory (name, country, lastSeen, stars)
  - pk: `USERS`
  - sk: `<userid>`

- **Tags** — per-user game tags
  - pk: `TAG`
  - sk: `<userid>`

- **Palettes** — per-user UI color palettes
  - pk: `PALETTES`
  - sk: `<userid>`

- **Customizations** — per-user, per-game UI settings
  - pk: `CUSTOMIZATION#<userid>`
  - sk: `<metaGame>`

- **Playground** — sandbox game state for a user
  - pk: `PLAYGROUND`
  - sk: `<userid>`

- **Player relations** — blocking (bidirectional)
  - pk: `PLAYER#<blockingPlayerId>`, sk: `BLOCKED#<blockedPlayerId>`
  - pk: `PLAYER#<blockedPlayerId>`, sk: `BLOCKEDBY#<blockingPlayerId>`
  - pk: `PLAYER#<userid>`, sk: `REPRESENTATIVE#<metaGame>#<gameid>` — per-user representative-game index (max 2 per metaGame)

- **Watched games** — spectator dashboard list (not a participant)
  - pk: `WATCHED#<userid>`, sk: `<gameid>`
  - summary fields mirror dashboard `Game` objects plus `addedAt`, `seen`, `lastChat`

- **Game watchers** — reverse index for fan-out on moves and chat
  - pk: `GAMEWATCHERS#<gameid>`, sk: `<userid>`

- **Highlighted games** — player page pins (participant only)
  - pk: `HIGHLIGHT#<userid>`, sk: `<metaGame>#<gameid>`
  - summary fields plus `addedAt` for display order

- **Representative games** — community recommendations per metaGame
  - pk: `REPRESENTATIVE#<metaGame>`, sk: `<userid>#<gameid>`
  - fields: `userId`, `userName`, `addedAt`, game summary fields

## Game lists

- **Current games by player** — per-player active game summaries (stream-maintained shadow; reads still use `USER.games[]` until Phase 3)
  - pk: `CURRENTGAMES#<userid>`
  - sk: `<gameid>`
  - summary fields mirror dashboard `Game` objects (`id`, `metaGame`, `players`, `toMove`, `lastMoveTime`, etc.)

- **Completed games by metaGame** — summary rows for the completed-games page
  - pk: `COMPLETEDGAMES#<metaGame>`
  - sk: `<timestamp>#<gameid>`

- **Completed games by player** — one item per player per game
  - pk: `COMPLETEDGAMES#<userid>`
  - sk: `<timestamp>#<gameid>`

**Retired (no longer written; purge via `node bin/purge-retired-completed-games.mjs --stage prod`):**

- pk: `COMPLETEDGAMES`, sk: `<timestamp>#<gameid>` — legacy global list
- pk: `COMPLETEDGAMES#<metaGame>#<userid>`, sk: `<timestamp>#<gameid>` — legacy per-player-per-game index

## Exploration

- **Game exploration** — move tree for a game position entered by a user
  - pk: `GAMEEXPLORATION#<gameid>`
  - sk: `<userid>#<movenumber>`

## Ratings and meta games

- **Ratings** — per metaGame leaderboard data
  - pk: `RATINGS#<metaGame>`
  - sk: `<userid>`

- **Meta game counts** — aggregate stats (current games, completed games, standing challenges, stars, etc.)
  - pk: `METAGAMES`
  - sk: `COUNTS`
  - Per-game nested maps are auto-initialized from `gameinfo` on `meta_games` reads and before count writes

- **Meta game counts (sharded, stream shadow)** — per-metaGame live counters written by the `gameProjector` Lambda; not read by the API until Phase 4b
  - pk: `METAGAMES#<metaGame>`
  - sk: `COUNTS`
  - fields: `currentgames`, `completedgames`, `standingchallenges`, `stars`, `ratingsCount`

- **Per-user game overlay (planned)** — per-user `seen` / `lastChat` on dashboard games (Phase 3+)
  - pk: `USERGAME#<userid>`
  - sk: `<gameid>`

## Challenges

- **Standing challenges** — open challenges listed by game
  - pk: `STANDINGCHALLENGE#<metaGame>`
  - sk: `<challengeid>`

- **Direct challenges** — challenge details
  - pk: `CHALLENGE`
  - sk: `<challengeid>`

- **SDG-style standing requests** — standing requests for open challenges with a limit
  - pk: `REALSTANDING`
  - sk: `<userid>`

## Bots

- **Bot identity** — Cognito client linkage and owner
  - pk: `BOT`
  - sk: `<clientId>`

- **Bot display name reservation**
  - pk: `BOTNAME`
  - sk: `<normalizedName>`

## Automated tournaments

- **Tournaments** — signup or in-progress tournaments
  - pk: `TOURNAMENT`
  - sk: `<tournamentid>`

- **Tournament player** — player reference
  - pk: `TOURNAMENTPLAYER`
  - sk: `<tournamentid>#<division>#<playerid>`

- **Tournament game** — game reference
  - pk: `TOURNAMENTGAME`
  - sk: `<tournamentid>#<division>#<gameid>`

- **Completed tournaments**
  - pk: `COMPLETEDTOURNAMENT`
  - sk: `<metaGame>#<tournamentid>`

- **Tournament counter** — per metaGame + variants combination (`variants` is a sorted, pipe-delimited variant list)
  - pk: `TOURNAMENTSCOUNTER`
  - sk: `<metaGame>#<variants>`
  - fields: `counter`, `over`

## Organized events

- **Events** — organizer-run event details
  - pk: `ORGEVENT`
  - sk: `<eventid>`

- **Event players**
  - pk: `ORGEVENTPLAYER`
  - sk: `<eventid>#<playerid>`

- **Event games**
  - pk: `ORGEVENTGAME`
  - sk: `<eventid>#<gameid>`

## WebSockets

- **WebSocket connections** — active API Gateway connection registry
  - pk: `wsConnections`
  - sk: `<connectionId>`
  - `userId`, `invisible`, `endpoint` — connection owner and API GW endpoint URL
  - `watchingGames` — string set of `metaGame#gameId` keys the client wants game events for
  - `wantsPresence` — boolean, default true; receive presence snapshot/delta messages
  - `watchVersion` — `1` when the client uses targeted game watch (enables strict filtering)
  - `ttl` — Unix epoch expiry (24h; refreshed on subscribe and `watchGames`)

- **WebSocket presence sequence** — monotonic counter for presence deltas
  - pk: `wsMeta`
  - sk: `presenceSeq`
  - `seq` — incremented on each debounced presence delta broadcast

## Related docs

- [Games and moves](/backend/subsystems/games-and-moves/)
- [Challenges](/backend/subsystems/challenges/)
- [Tournaments](/backend/subsystems/tournaments/)
- [Events](/backend/subsystems/events/)
- [Bots](/backend/subsystems/bots/)
- [WebSockets](/backend/subsystems/websockets/)
- [Player blocking](/backend/subsystems/player-blocking/)
