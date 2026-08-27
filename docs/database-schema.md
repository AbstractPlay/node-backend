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

- **Users** — profile, settings, challenge lists (dashboard via indexes below)
  - pk: `USER`
  - sk: `<userid>`
  - fields include `publicRivalries` (boolean, default false) — opt in to public rivalries table
  - `cleaned` (boolean, optional) — set by [dashboard cruft cleanup](/crons/dashboard-cruft-cleanup/) for inactive users; cleared on `me_dashboard` login
  - `dashboardMaintAt` (number, optional) — lease timestamp for per-user dashboard maintenance lock (`me_dashboard` prune/timeout sweep)
  - **Retired (Phase 5):** `games[]`, `gamesUpdate` — removed from all USER records in prod (Aug 2025)

- **Push subscriptions** — web push endpoints (one record per browser/device)
  - pk: `PUSH`
  - sk: `<userid>#<subscriptionKey>` (`subscriptionKey` = first 16 hex chars of SHA-256 of `payload.endpoint`)
  - fields: `payload`, `endpoint`, `updatedAt`
  - legacy: `sk: <userid>` (migrated on next `save_push` or removed on 404/410)

- **User list** — public directory (name, country, lastSeen, stars, bggid; `about` fetched per profile via `player_about`)
  - pk: `USERS`
  - sk: `<userid>`
  - `about` — optional markdown bio (max 100KB UTF-8; no HTML or images; max 20 links). Not included in `user_names`; use public query `player_about`.
  - `USER` record also stores `aboutSaveDay` / `aboutSaveCount` for rate limiting (10 saves per user per UTC day across human `about` and bot `description` edits)

- **Tags** — per-user game tags
  - pk: `TAG`
  - sk: `<userid>`

- **Palettes** — per-user UI color palettes
  - pk: `PALETTES`
  - sk: `<userid>`

- **Customizations** — per-user, per-game UI settings
  - pk: `CUSTOMIZATION#<userid>`
  - sk: `<metaGame>`

- **Playground saves** — per-user saved playground positions (unlimited slots)
  - pk: `PLAYGROUND#<userid>`
  - sk: `<uuid>`
  - fields: `id`, `name`, `metaGame`, `date` (epoch ms), `body` (JSON string; gzip-compressed when large)

**Retired (no longer written; purged from prod Aug 2025):**

- pk: `PLAYGROUND`, sk: `<userid>` — legacy single-slot sandbox

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

- **Recommendation impression events** — logged-in show/click/challenge telemetry for offline tuning (no live reads)
  - pk: `RECOMMENDS#<userid>`
  - sk: `<epochMs>#<random>`
  - fields: `event`, `batchId`, `surface`, `tier`, `expiresAt` (TTL, ~90 days), plus `metaGame`, `position`, `reasonType`, `gameIds`, `reasons` as applicable
  - no GSI; rate limit 50 events/user/UTC day

- **Game Move layout feedback events** — beta layout experiment telemetry (no live reads)
  - pk: `LAYOUTFB#<userid>`
  - sk: `<epochMs>#<random>`
  - fields: `event`, `layoutId`, plus `rating`, `comment`, `toLayoutId`, `gameId`, `durationMs` as applicable
  - no GSI; **no TTL** (manual purge when experiment ends); no rate limit

- **In-app dashboard notifications** — per-user feed shown on `me_dashboard` (distinct from email/push)
  - pk: `NOTIFICATION#<userid>`
  - sk: `<epochMs>#<random>`
  - fields: `body` (typed JSON object), `expiresAt` (TTL seconds; 180 days on create, tightened to 7 days on first dashboard fetch)
  - no GSI
  - `body.type` values: `gameStart`, `gameEnd`, `ratingChange`, `challengeIssued`, `challengeDeclined`, `challengeRevoked`, `eventInvitation`, `completedGameChat`
  - `eventInvitation` is sent when an organizer saves the invite list on a moderated `ORGEVENT` (`event_update_invites`); not used for automated tournaments. Body includes `eventId`, `eventName`, `organizerId`, `organizerName`. Inspect rows with `bin/dump-dashboard.mjs` `--include-notifications` (read-only; does not refresh TTL)

## Game lists

- **Current games by player** — per-player active game summaries (stream-maintained; Phase 3 reads from here)
  - pk: `CURRENTGAMES#<userid>`
  - sk: `<gameid>`
  - summary fields mirror dashboard `Game` objects (`id`, `metaGame`, `players`, `toMove`, `lastMoveTime`, `numMoves`, etc.)

- **Recent completed games by player** — moved to **Retired** below

- **Completed games by metaGame** — summary rows for the completed-games page
  - pk: `COMPLETEDGAMES#<metaGame>`
  - sk: `<timestamp>#<gameid>`

- **Completed games by player** — one item per player per game
  - pk: `COMPLETEDGAMES#<userid>`
  - sk: `<timestamp>#<gameid>`

**Retired (no longer written; purged from prod — zero rows remain):**

- pk: `RECENTCOMPLETED#<userid>`, sk: `<gameid>` — legacy completed-dashboard index; post-game chat uses `completedGameChat` notifications
- pk: `COMPLETEDGAMES`, sk: `<timestamp>#<gameid>` — legacy global list
- pk: `COMPLETEDGAMES#<metaGame>#<userid>`, sk: `<timestamp>#<gameid>` — legacy per-player-per-game index

## Exploration

- **Game exploration** — move tree for a game position entered by a user
  - pk: `GAMEEXPLORATION#<gameid>`
  - sk: `<userid>#<movenumber>`

## Ratings and meta games

- **Ratings (deprecated)** — legacy realtime Elo leaderboard rows; no longer written after batch Glicko migration. Existing `RATINGS#<metaGame>` items may remain in DynamoDB.
  - pk: `RATINGS#<metaGame>`
  - sk: `<userid>`

- **Meta game counts** — aggregate stats (retired monolith; admin recount writes sharded items)
  - pk: `METAGAMES` / sk: `COUNTS` — **retired** (Phase 5); delete after verification

- **Meta game counts (sharded, authoritative)** — per-metaGame live counters; stream + inline app writes; `meta_games` reads and admin `update_meta_game_counts` write here
  - pk: `METAGAMES#<metaGame>`
  - sk: `COUNTS`
  - fields: `currentgames`, `completedgames`, `standingchallenges`, `stars`, `ratingsCount` (distinct rated players per meta game; sourced from `_summary-ratings.json` `playerCountsByUid` on recount and served by `meta_games`)

- **Per-user game overlay (Phase 5)** — per-user `seen` / `lastChat` on dashboard games; sole overlay store
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
- [Recommendations](/backend/subsystems/recommendations/) — impression event storage
