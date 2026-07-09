# Games and moves

## Overview

Active games are stored as `GAME` records. The sort key encodes metaGame, completion bit (`0` = in progress), and game id:

```
pk: GAME
sk: <metaGame>#0#<gameid>
```

When a game completes, the completion bit becomes `1` and summary rows are written to `COMPLETEDGAMES*` families.

Each `USER` record holds a denormalized `games` array for the dashboard (id, metaGame, toMove, players, clocks, etc.).

## Lifecycle

1. **Created** — from an accepted challenge or tournament/event pairing.
2. **In progress** — `submit_move` validates via `@abstractplay/gameslib`, updates state, clocks, and `toMove`.
3. **Automove** — for games with the `automove` flag, if the next player has only one legal move, the backend plays it automatically.
4. **Time loss** — `timeloss` (auth or internal) ends games when clocks expire.
5. **Abandoned** — `abandoned` handles resign/abandon flows.
6. **Completed** — archived to `COMPLETEDGAMES#*` indexes; removed from active lists after the user has seen the result.

## Key queries

| Query | Endpoint | Purpose |
|-------|----------|---------|
| `submit_move` | auth | Play a move |
| `get_game` | public / auth | Fetch game state |
| `timeloss` | auth | Report timeout |
| `abandoned` | auth | Abandon game |
| `invoke_pie` | auth | Pie rule — reverse player order |
| `set_game_state` | auth | Admin state injection |
| `update_game_settings` | auth | Per-game settings |
| `submit_comment` | auth | Game chat (`GAMECOMMENTS`) |
| `update_note` | auth | Per-user notes (`NOTE`) |

## Pie rule

`invoke_pie` reverses the player list in the `GAME` record and in each participant's `USER.games` entry.

## Playground

Sandbox games use `PLAYGROUND` records (`pk: PLAYGROUND`, `sk: <userid>`) — separate from live `GAME` records. Queries: `get_playground`, `new_playground`, `reset_playground`.

## Record types

- [Database schema](/backend/database-schema/) — `GAME`, `GAMECOMMENTS`, `NOTE`, `COMPLETEDGAMES*`, `PLAYGROUND`

## Related

- [Challenges](/backend/subsystems/challenges/) — how games start
- [Gameslib](/gameslib/) — rules engine
