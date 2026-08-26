# Tournaments

## Overview

**Automated tournaments** are distinct from [organizer events](/backend/subsystems/events/). The backend runs signup, pairing, and game creation from `TOURNAMENT*` records and scheduled public queries.

## Record types

| pk | sk | Purpose |
|----|-----|---------|
| `TOURNAMENT` | `<tournamentid>` | Tournament definition and state |
| `TOURNAMENTPLAYER` | `<tournamentid>#<division>#<playerid>` | Player entry |
| `TOURNAMENTGAME` | `<tournamentid>#<division>#<gameid>` | Linked game |
| `COMPLETEDTOURNAMENT` | `<metaGame>#<tournamentid>` | Archived tournament |
| `TOURNAMENTSCOUNTER` | `<metaGame>#<variants>` | Serial number counter |

## Lifecycle

1. **Create** — auth `new_tournament` (organizer). Requires the meta game to support `playercount: 2` in gameslib (`playercounts` includes `2`).
2. **Join / withdraw** — `join_tournament`, `withdraw_tournament`. Join is rejected for the same 2-player requirement.
3. **Start** — [`starttournaments`](/crons/live-crons/) Lambda (EventBridge 10:00/22:00 UTC). Admins can also invoke it for one tournament (including resume after a partial start). Signup tournaments for ineligible games are cancelled (same path as zero participants).
4. **Play** — games are normal `GAME` records linked via `TOURNAMENTGAME`.
5. **End** — auth `end_tournament`; public `archive_tournaments` moves completed tournaments.

## Public schedulers

These are called by cron or external schedulers (no user auth):

- `get_tournaments`, `get_tournament`, `get_old_tournaments`
- `archive_tournaments`

## Player blocking

Tournament pairing and visibility are **not** affected by player blocking.

## Queries

See [Public queries](/backend/api/public-queries/) and [Auth queries](/backend/api/auth-queries/) tournament sections.

## Related

- [Events](/backend/subsystems/events/) — manual organizer events
- [Database schema](/backend/database-schema/)
