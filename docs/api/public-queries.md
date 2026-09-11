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
| `recent_completed_games` | Completed games site-wide in the last N days (default 30; global `COMPLETEDGAMES` index) | `days` (optional), `limit` (optional), `exclusiveStartKey` (optional) |
| `representative_games` | Community-recommended completed games | `metaGame` |
| `get_game` | Full game record with `watchCount` | `metaGame`, `id`, `cbit` |
| `get_public_exploration` | Published exploration tree | `gameid`, `userid`, `movenumber` |

## Challenges

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `challenge_details` | Single challenge record | `id` |
| `standing_challenges` | Open challenges for a metaGame (unfiltered) | `metaGame` |
| `all_standing_challenges` | All open standing challenges site-wide (unfiltered) | — |

Logged-in clients should use the auth `standing_challenges` or `all_standing_challenges` query instead so blocked players' challenges are hidden.

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

## Telemetry

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `log_gamemove_layout_event` | Anonymous Game Move layout usage event | `event`, `sessionId`, `layout`, `resolvedFrom`, `metaGame`, plus event-specific fields |

Logged-in clients should use the auth `log_gamemove_layout_event` query instead (higher server rate limit; `userHash` stored).

See [Game Move layout analytics](/backend/subsystems/game-move-layout-analytics/).

## Feedback (bugs, ideas, wishlist)

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `feedback_list` | Public board listing | `kind` (`bug` \| `feature` \| `wishlist`), optional `sort` (`votes` \| `recent` \| `updated`, default `votes`), `limit`, `cursor` |
| `feedback_get` | Single post with comments and presigned attachment URLs | `id` |

Returns `{ items, nextCursor? }` for list; `{ post, comments, attachmentUrls }` for get. Terminal/archived items are excluded from list.

## Maintenance

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `bot_move` | Legacy/internal bot move path | varies |
| `report_problem` | User problem reports | varies |

## Related

- [API overview](/backend/api/overview/)
- [Auth queries](/backend/api/auth-queries/)
