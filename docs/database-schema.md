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

## Game lists

- **All completed games** — not currently used in the UI
  - pk: `COMPLETEDGAMES`
  - sk: `<timestamp>#<gameid>`

- **Completed games by metaGame and player** — not used yet
  - pk: `COMPLETEDGAMES#<metaGame>#<userid>`
  - sk: `<timestamp>#<gameid>`

- **Completed games by metaGame** — summary rows for the completed-games page
  - pk: `COMPLETEDGAMES#<metaGame>`
  - sk: `<timestamp>#<gameid>`

- **Completed games by player** — one item per player per game
  - pk: `COMPLETEDGAMES#<userid>`
  - sk: `<timestamp>#<gameid>`

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

## Related docs

- [Games and moves](/backend/subsystems/games-and-moves/)
- [Challenges](/backend/subsystems/challenges/)
- [Tournaments](/backend/subsystems/tournaments/)
- [Events](/backend/subsystems/events/)
- [Bots](/backend/subsystems/bots/)
- [WebSockets](/backend/subsystems/websockets/)
- [Player blocking](/backend/subsystems/player-blocking/)
