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

1. **Create** — auth `new_tournament` (organizer).
2. **Join / withdraw** — `join_tournament`, `withdraw_tournament`.
3. **Start** — public `start_tournaments` (scheduler) or auth/public `start_tournament` for one tournament.
4. **Play** — games are normal `GAME` records linked via `TOURNAMENTGAME`.
5. **End** — auth `end_tournament`; public `archive_tournaments` moves completed tournaments.

## Public schedulers

These are called by cron or external schedulers (no user auth):

- `get_tournaments`, `get_tournament`, `get_old_tournaments`
- `start_tournaments`, `archive_tournaments`, `start_tournament`

## Player blocking

Tournament pairing and visibility are **not** affected by player blocking.

## Queries

See [Public queries](/backend/api/public-queries/) and [Auth queries](/backend/api/auth-queries/) tournament sections.

## Related

- [Events](/backend/subsystems/events/) — manual organizer events
- [Database schema](/backend/database-schema/)
