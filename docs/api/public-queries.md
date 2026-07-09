# Public queries

Handler: `module.exports.query` — no authentication required.

POST body: `{ "query": "<name>", "pars": { ... } }`

## Users and meta

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `user_names` | Player and bot directory for challenges | — |
| `meta_games` | Meta game counts and stats | — |
| `ratings` | Leaderboard for a game | `metaGame` |

## Games

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `games` | Active games for a metaGame | `metaGame` |
| `get_game` | Full game record | `metaGame`, `id` |
| `get_public_exploration` | Published exploration tree | `gameid`, `userid`, `movenumber` |

## Challenges

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `challenge_details` | Single challenge record | `id` |
| `standing_challenges` | Open challenges for a metaGame (unfiltered) | `metaGame` |

Logged-in clients should use the auth `standing_challenges` query instead so blocked players' challenges are hidden.

## Tournaments

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `get_tournaments` | Active automated tournaments | — |
| `get_old_tournaments` | Archived tournaments | `metaGame` (optional) |
| `get_tournament` | Single tournament | `id` |
| `start_tournaments` | Scheduler: start due tournaments | — |
| `archive_tournaments` | Scheduler: archive completed tournaments | — |
| `start_tournament` | Start one tournament | `id` |

## Events

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `get_events` | List organizer events | — |
| `get_event` | Single event | `id` |

## Maintenance

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `bot_move` | Legacy/internal bot move path | varies |
| `report_problem` | User problem reports | varies |

## Related

- [API overview](/backend/api/overview/)
- [Auth queries](/backend/api/auth-queries/)
