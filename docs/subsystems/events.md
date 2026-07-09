# Events

## Overview

**Organizer events** (`ORGEVENT*`) are manually run competitions: an organizer creates an event, players register, games are linked, and results are recorded. This is separate from [automated tournaments](/backend/subsystems/tournaments/).

## Record types

| pk | sk | Purpose |
|----|-----|---------|
| `ORGEVENT` | `<eventid>` | Event metadata (name, description, schedule, divisions) |
| `ORGEVENTPLAYER` | `<eventid>#<playerid>` | Registered player |
| `ORGEVENTGAME` | `<eventid>#<gameid>` | Game linked to the event |

## Lifecycle

1. **Create** — `event_create` (organizer).
2. **Publish** — `event_publish` makes the event visible.
3. **Register / withdraw** — `event_register`, `event_withdraw`.
4. **Update** — name, description, start time, invites, divisions, results.
5. **Create games** — `event_create_games` links new `GAME` records.
6. **Close** — `event_close`.
7. **Delete** — `event_delete`.

## Public reads

- `get_events` — list events
- `get_event` — single event with players and games

## Player blocking

Events are **not** affected by player blocking.

## Queries

All `event_*` queries are auth-only. See [Auth queries](/backend/api/auth-queries/).

## Related

- [Tournaments](/backend/subsystems/tournaments/)
- [Database schema](/backend/database-schema/)
