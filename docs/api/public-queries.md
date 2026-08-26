# Public queries

Handler: `module.exports.query` — no authentication required.

POST body: `{ "query": "<name>", "pars": { ... } }`

## Users and meta

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `user_names` | Player and bot directory for challenges (no `about` field; use `player_about`) | — |
| `player_highlights` | Highlighted games for a player page | `userId` |
| `player_about` | Player or bot bio (`about` / `description`) | `userId` |
| `meta_games` | Meta game counts and stats | — |

## Games

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `games` | Active games for a metaGame | `metaGame` |
| `representative_games` | Community-recommended completed games | `metaGame` |
| `get_game` | Full game record with `watchCount` | `metaGame`, `id`, `cbit` |
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
| `archive_tournaments` | Scheduler: archive completed tournaments | — |

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
