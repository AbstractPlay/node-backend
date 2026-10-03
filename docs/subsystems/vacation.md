# Vacation mode

Correspondence **vacation** pauses a player’s turn clock across **all** active games while enabled, using **14 × 24-hour blocks** (336 hours) of pause time per UTC quota year. Implementation is phased; this page is the **canonical living inventory** for clock derivation (Phase 0 audit **2026-10-02**). Update row `Status` here as work lands; the Cursor plan links here rather than duplicating tables.

## Single path for clock state

- **Server authority:** Live remaining time, timeout eligibility, and move `timeUsed` go through [`lib/clockElapsed.ts`](../../lib/clockElapsed.ts) and [`lib/vacation/`](../../lib/vacation/) on all Must-wire paths (Phase 2 complete). No ad hoc `bank - (now - lastMoveTime)` in production paths.
- **Clients:** Display only. Use server fields (`effectiveRemainingMs`, `clockDisplayServerTime`, `clockPaused`) and a single helper such as `tickDisplayRemaining` — no parallel elapsed math for timeloss or countdown correctness.

See [Games and moves](/backend/subsystems/games-and-moves/) for lazy timeout collapse (`me_dashboard`, `get_game`, timeout move).

## Product rules (summary)

| Rule | Detail |
|------|--------|
| Scope | Universal (casual, tournament, event, solo; hard and soft clocks) |
| Allotment | 14 × 86_400_000 ms pause per UTC quota year |
| Start | Immediate or scheduled future datetime |
| End | Fixed end (editable until passed) or open-ended until stop or quota exhausted |
| Stop | Anytime; cancel scheduled stint before start without charge |

---

## Clock derivation inventory

**Status legend:** `open` = must change for vacation; `done` = wired to single path; `n/a` = no live elapsed math.

**Class:** **Must wire** (server behaviour), **Server payload** (API adds display fields), **Display-only** (front UI), **N/A**.

### node-backend — Must wire (Phase 2)

| File | Lines / symbol | Phase | Status | Notes |
|------|----------------|-------|--------|-------|
| [`lib/gameTimeout.ts`](../../lib/gameTimeout.ts) | 50–53, 97 — `elapsed`, `now - lastMoveTime` | 2 | done | Lazy sweep + `get_game`; uses `remainingBankMs` / `wouldTimeOut` + vacation windows |
| [`lib/games/playHandlers.ts`](../../lib/games/playHandlers.ts) | 456–462, 946–952 — `timeUsed` | 2 | done | Move + pie paths via `effectiveElapsedMs` |
| [`lib/games/playHandlers.ts`](../../lib/games/playHandlers.ts) | 809–834 — `timeout()` | 2 | done | Opponent timeout move |
| [`lib/games/timeloss.ts`](../../lib/games/timeloss.ts) | 137–160 — `check: true` | 2 | done | Auth timeloss check |
| [`lib/profile/me.ts`](../../lib/profile/me.ts) | 341 — `nextGame` remaining | 2 | done | Sort by urgency |
| [`utils/yourturn.ts`](../../utils/yourturn.ts) | 160 — urgent &lt; 24h | 2 | done | Email cron |

### node-backend — Server payload (Phase 4)

| File | Phase | Status | Notes |
|------|-------|--------|-------|
| [`lib/games/getGame.ts`](../../lib/games/getGame.ts) | 4 | done | `clockDisplayServerTime`, per on-clock player `effectiveRemainingMs` / `clockPaused` |
| [`lib/meQuery.ts`](../../lib/meQuery.ts) / [`lib/profile/me.ts`](../../lib/profile/me.ts) | 4 | done | `vacation` snapshot on `me_profile` / `me_dashboard`; dashboard games include clock display fields |

### node-backend — Policy (Phase 5)

| Item | Status | Notes |
|------|--------|-------|
| Universal scope (all game types) | done | [`lib/vacation/policy.ts`](../../lib/vacation/policy.ts) — `vacationSchedulePolicyError` (no blocks today) |
| Product rules doc | done | Scope row in **Product rules** + this section |

### node-backend — Auth API (Phase 3)

| Query | Module | Status |
|-------|--------|--------|
| `schedule_vacation` | [`lib/vacation/authHandlers.ts`](../../lib/vacation/authHandlers.ts) → [`mutations.ts`](../../lib/vacation/mutations.ts) | done |
| `update_vacation` | same | done |
| `stop_vacation` | same | done |

See [Auth queries — Vacation](/backend/api/auth-queries/#vacation-correspondence-clock-pause).

### node-backend — N/A (documented)

| File | Reason |
|------|--------|
| [`lib/challenges/authHandlers.ts`](../../lib/challenges/authHandlers.ts), [`lib/tournaments/createTournamentPairingGame.ts`](../../lib/tournaments/createTournamentPairingGame.ts), [`lib/events/authHandlers.ts`](../../lib/events/authHandlers.ts), [`lib/games/solo.ts`](../../lib/games/solo.ts) | Initial bank `clockStart * 3600000`, set `lastMoveTime` at create |
| [`lib/games/playHandlers.ts`](../../lib/games/playHandlers.ts) `abandoned` | ~1118–1122 — 30-day activity heuristic, not turn clock |
| [`lib/gameProjector.ts`](../../lib/gameProjector.ts) | `lastMoveTime` in index `sk` only |
| [`lib/botOutbound.ts`](../../lib/botOutbound.ts) | `clockCurr` from stored bank hours for bot API (revisit if humans on vacation need bot-facing semantics) |
| [`lib/dashboardGames.ts`](../../lib/dashboardGames.ts), [`lib/playerGameMarks.ts`](../../lib/playerGameMarks.ts) | Pass-through / summary fields |
| [`crons/src/functions/starttournaments.ts`](../../crons/src/functions/starttournaments.ts), [`crons/src/functions/standingchallenges.ts`](../../crons/src/functions/standingchallenges.ts) | Types / challenge metadata |
| [`crons/src/functions/records-move-times.ts`](../../crons/src/functions/records-move-times.ts) | Analytics on recorded move times |
| `test/**` | Fixtures |

### front — Display-only (Phase 6)

Server seeds: `clockDisplayServerTime`, per-player `effectiveRemainingMs` / `clockPaused` (on-clock only), and **`onVacation` / `vacationScheduled`** on every player (stint visibility even when off the clock). Front helper: `front/src/lib/gameClockDisplay.js`; chips via `moveEntryUtils.js`.

| File | Status | Notes |
|------|--------|-------|
| `front/src/lib/gameClockDisplay.js` | done | Tick + timeout from seeds; legacy fallback |
| `front/src/components/GameMove/preview/moveEntryUtils.js` | done | Chips include vacation + pause |
| `front/src/components/GameMove/preview/CardTurnBar.js` | done | On vacation / clock paused labels |
| `front/src/components/GameMove/MoveEntry.js`, `useDockMoveEntry.js` | done | Timeloss via `isPlayerTimedOut` |
| `front/src/components/GameMove/useGameMoveSession.js` | done | Spectator timeloss + opponent-on-vacation parenthetical |
| `front/src/components/Me/MyTurnTable.js`, `TheirTurnTable.js`, `Me.js` | done | Dashboard clocks + opponent vacation tag + sort |

### front — N/A

| File | Reason |
|------|--------|
| `NewChallengeModal.js`, `StandingChallengeModal.js`, `Event/Pair.js`, `SoloPlayModal.js` | Challenge **settings** (start/inc/max/hard), not live elapsed |
| `Challenge*Modal.js`, `StandingChallenges.js` | Display challenge clock config |
| `RecentCompletedGames.js`, `WatchedGamesTable.js` | `lastMoveTime` as “last activity” date |
| `usePersistedTableSorting.test.js` | Column id `timeRemaining` only |

### front — follow-up

Add `bin/check-clock-derivation.mjs` (or equivalent) in the **front** repo mirroring backend patterns, allowlisting tests and the one approved display helper once refactored.

---

## Regression guard

From node-backend root:

```bash
npm run check:clock-derivation
npm run check:clock-derivation -- --strict
```

`--strict` exits non-zero when **non-allowlisted** files under `lib/` and `utils/` match forbidden live-clock patterns. Allowlist shrinks to zero as Phase 2 completes.

---

## Implementation log

- **2026-10-02 — Phase 0:** Inventory completed (backend + front ripgrep). Must wire: 6 backend sites; Display-only: 9 front sites (+ central `moveEntryUtils.js`).
- **2026-10-02 — Phase 1:** Pure modules [`lib/vacation/`](../../lib/vacation/) + [`lib/clockElapsed.ts`](../../lib/clockElapsed.ts); tests `test/vacation.test.ts`, `test/clockElapsed.test.ts` (26 tests).
- **2026-10-02 — Phase 2:** Must-wire paths use `effectiveElapsedMs` / `remainingBankMs` / `wouldTimeOut` with `prepareVacationWindowsForPlayerIds`; guard allowlist empty; `test/gameTimeout.test.ts` vacation case.
- **2026-10-02 — Phase 3:** `schedule_vacation`, `update_vacation`, `stop_vacation` authQuery handlers; USER writes in [`lib/vacation/mutations.ts`](../../lib/vacation/mutations.ts); tests `test/vacationMutations.test.ts`.
- **2026-10-02 — Phase 4:** `vacation` on `me_profile` / `me_dashboard`; dashboard + `get_game` clock display seeds (`clockDisplay.ts`, `dashboardClock.ts`).
- **2026-10-02 — Phase 5:** Universal vacation policy module + docs; schedule path calls `vacationSchedulePolicyError` (extensible, no game-type blocks).
- **2026-10-03 — Phase 6 (front):** Display-only UI in `apfront` uses server clock seeds; opponent **`onVacation`** on dashboard/`get_game` players (backend `isVacationStintLive` + `enrichClockGameSlice`).
