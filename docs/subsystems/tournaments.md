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
| `TOURNAMENTSCOUNTER` | `<metaGame>#<variants>` (single-leg) or `…#2` (two-leg) | Serial number counter per series |

## Lifecycle

1. **Create** — auth `new_tournament` (organizer). Requires the meta game to support `playercount: 2` in gameslib (`playercounts` includes `2`). Optional `matchLegs: 2` enables **two-leg** pairings (leg 2 opens when leg 1 ends, with swapped seats). Default is single game per opponent (`matchLegs: 1` or omitted).
2. **Join / withdraw** — `join_tournament`, `withdraw_tournament`. Join is rejected for the same 2-player requirement.
3. **Start** — [`starttournaments`](/crons/live-crons/) Lambda (EventBridge 10:00/22:00 UTC). Admins can also invoke it for one tournament (including resume after a partial start). Signup tournaments for ineligible games are cancelled (same path as zero participants).
4. **Play** — games are normal `GAME` records linked via `TOURNAMENTGAME`.
5. **End** — auth `end_tournament`; public `archive_tournaments` moves completed tournaments.

### Two-leg format (`matchLegs: 2`)

- At start, only **leg 1** games are created (same round-robin pairings as single-leg).
- `divisions.*.numGames` counts **both** legs (`2 ×` pairings per division).
- When a leg-1 game finishes, the API creates **leg 2** for that pairing with reversed seat order.
- Generated game records use `header.round` of `1:1` and `1:2` (`{schedulingRound}:{matchLeg}`). Single-leg tournaments remain `1`.

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
