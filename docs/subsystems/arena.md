# Realtime Arena

Live **2-player Fischer** games: open and closed lobby tables, and **`submit_arena_move`** with EventBridge Scheduler timeouts. Correspondence challenges, ladder games, and dashboard timeout sweeps are unchanged.

## Product rules (v1)

| Topic | Rule |
|-------|------|
| Eligibility | Meta-games with `playercounts` including **2** only |
| Ratings | All arena games **`unrated: true`** until rated v2 |
| Dashboard | Arena **excluded** from `me_dashboard` |
| Vacation | Correspondence vacation **does not pause** arena clocks; arena play allowed during vacation |
| Game id | **`tableId === GAME.id`** when play launches (stable URL + chat) |
| Clock | Server **`moveReceivedAt`** at handler entry; grace **`ARENA_CLOCK_GRACE_MS`** (750ms) |
| Start sync | **`arena_launch`** WS to both players; **`arena_play_ready`** when play UI rendered; **3s** countdown (`arenaClockStartAt`) before Fischer time runs |

See [Vacation mode](/backend/subsystems/vacation/) for the correspondence vs arena exception.

## Storage

| pk | sk | Purpose |
|----|-----|---------|
| `ARENATABLE` | `tableId` | Lobby state, seats, ready, swap |
| `ARENAINDEX#<state>` | inverted time + `tableId` | Public listing (`waiting` / `seated` / `playing`) |
| `ARENAUSER` | `userId` | One active arena table/game per user |
| `GAME` | `<meta>#0#<tableId>` | Live play (`playMode: 'arena'`, `arenaTcId`, `arenaClock`) |
| `GAMECOMMENTS` | `<tableId>` | Lobby + in-game + post-game chat thread |
| `ARENAFB#<userId>` | `<metaGame>#<gameId>` | Optional post-game feedback (soak) |

Details: [Database schema](/backend/database-schema/) (Games section).

## API

Public **`list_arena_time_controls`**, **`list_arena_tables`**. Auth table RPCs and **`submit_arena_move`** are documented in [Auth queries — Realtime arena](/backend/api/auth-queries/#realtime-arena-tables).

Post-game soak feedback: **`submit_arena_feedback`** (players only, after `gameEnded`; idempotent per user/game).

## Move path

Dedicated **`submit_arena_move`** (not `submit_move`):

1. Stamp **`moveReceivedAt`** synchronously at handler entry.
2. Out-of-time check at receipt + grace.
3. Shared gameslib **`applyMove`** / simultaneous path.
4. **`applyArenaMoveClock`** (Fischer ms, automove increments, no vacation).
5. Reschedule **EventBridge Scheduler** → **`arenaFlagWorker`** → **`timeloss`**. If the worker runs before **`ARENA_CLOCK_GRACE_MS`** has elapsed (`not_flagged_yet`), it **re-arms** the one-shot at **`now + 250ms`** when `(nominal + grace)` is already past (past `at()` expressions are unreliable). Stale-generation invocations **re-arm** or end the game if already past grace.

Structured logs: JSON line **`arenaMoveTiming`** per move. CloudWatch metrics (namespace **`AbstractPlay/Arena`**): **`ArenaMoveProcessingMs`**, **`ArenaMoveOotReject`** (dimensions `tier`, `stage`).

## Front

Routes: **`/arena`**, **`/arena/table/:meta/:id`**, **`/arena/play/:meta/:id`**, **`/arena/watch/:meta/:id`**. Landing polls **`list_arena_tables`**. Play uses live Fischer display and optional post-game feedback modal.

## v1 soak playbook

**Weekly (dev/prod):**

1. `node scripts/dump-arena-feedback.mjs --stage prod --from … --to …` → JSONL.
2. CloudWatch → **`AbstractPlay/Arena`** → review **`ArenaMoveProcessingMs`** p95 by `tier`; scan **`arenaMoveTiming`** logs for OOT rejects.
3. Discuss unfair-clock / responsiveness themes in [#dev-curious](https://discord.abstractplay.com).

**Week 2–4:** Tune grace, TC `enabled` flags, or infra only with data — no per-title server blocks in v1.

**Retire feedback:** disable modal + RPC; archive dump; `node scripts/purge-arena-feedback.mjs --stage prod` (after backup).

## Records

Completed arena games stamp **`header.site.playMode`**, **`arenaTcId`**, **`arenaClock`** on archived JSON ([records cron](/crons/pipeline/)). Glicko ignores unrated arena games until rated v2 split. Finished arena games also appear in **`recent_completed_games`** (`COMPLETEDGAMES` index) when they meet the usual move-count keep rules (same as correspondence). One-time backfill for games finished before that hook: `npm run backfill-arena-completed-index -- --stage dev --dry-run` then `--apply`.

## Related

- [Games and moves](/backend/subsystems/games-and-moves/) — correspondence vs arena entry
- [WebSockets](/backend/subsystems/websockets/) — `watchGames` + `game` verb for live play and spectate; `arena_launch` / `arena_sync` (user-targeted) for arena start
