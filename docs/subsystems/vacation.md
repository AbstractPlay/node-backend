# Vacation mode

Correspondence **vacation** pauses a player’s turn clock across **all** active games while a stint is live, using **14 × 24-hour blocks** (336 hours) of pause time per UTC quota year. This page describes how the feature is implemented today (backend + front).

## Single path for clock state

- **Server authority:** Live remaining time, timeout eligibility, and move `timeUsed` go through [`lib/clockElapsed.ts`](../../lib/clockElapsed.ts) and [`lib/vacation/`](../../lib/vacation/). Production paths do not use ad hoc `bank - (now - lastMoveTime)`.
- **Clients:** Display only. Use server fields (`effectiveRemainingMs`, `clockDisplayServerTime`, `clockPaused`) and a single helper such as `tickDisplayRemaining` — no parallel elapsed math for timeloss or countdown correctness. **`effectiveRemainingMs` may be negative** on soft-clock games so the UI can show how far over time a player is (same as legacy client math); hard-clock timeout still uses server `wouldTimeOut` / timeloss paths. **`clockPaused`** stops the display countdown during vacation but does not block manual timeloss when effective remaining is already negative.

See [Games and moves](/backend/subsystems/games-and-moves/) for lazy timeout collapse (`me_dashboard`, `get_game`, timeout move).

## Product rules (summary)

| Rule | Detail |
|------|--------|
| Scope | Universal (casual, tournament, event, solo; hard and soft clocks) |
| Allotment | 14 × 86_400_000 ms pause per UTC quota year |
| Start | Immediate or scheduled future datetime |
| End | Fixed end (editable until passed) or open-ended until stop or quota exhausted |
| Stop | Anytime; cancel scheduled stint before start without charge |

Policy gate: [`lib/vacation/policy.ts`](../../lib/vacation/policy.ts) (`vacationSchedulePolicyError` — extensible; no game-type blocks today).

---

## Storage and sync

**Authoritative stint** lives on the private **`USER`** row (`vacationStartsAt`, `vacationEndsAt`, `vacationOpenEnded`, `vacationStintStartedAt`, `vacationPauseMsUsed`, `vacationQuotaYear`). Writes go through [`lib/vacation/mutations.ts`](../../lib/vacation/mutations.ts); lazy end-of-stint / quota rollover via [`lib/vacation/persist.ts`](../../lib/vacation/persist.ts) (`finalizeVacationIfNeeded`).

**Public directory mirror:** When a stint is **live** (`isVacationStintLive`), [`lib/vacation/publicMirror.ts`](../../lib/vacation/publicMirror.ts) sets `USERS.onVacation = true`; otherwise it **REMOVE**s the attribute. Scheduled-but-not-started stints do **not** set the mirror. Sync runs after successful schedule/update/stop, after finalize writes, and when [`player_about`](../../lib/public/players.ts) loads a human profile (keeps directory aligned on profile views).

| Surface | What clients see |
|---------|------------------|
| `user_names` | Optional `onVacation: true` on human entries ([`lib/public/catalog.ts`](../../lib/public/catalog.ts)) |
| `player_about` | `{ about?, vacation? }` — `vacation` is a full snapshot (scheduled/active, times, open-ended, blocks/quota remaining); omitted when no stint on file |
| `me_profile` / `me_dashboard` | `vacation` snapshot on the authenticated user |
| Dashboard games / `get_game` | Per-player `onVacation` / `vacationScheduled`; on-clock players also get `effectiveRemainingMs`, `clockPaused`, plus `clockDisplayServerTime` on the game slice |

See [Public queries](/backend/api/public-queries/) (`user_names`, `player_about`) and [Auth queries — Vacation](/backend/api/auth-queries/#vacation-correspondence-clock-pause).

---

## Auth API

| Query | Handler |
|-------|---------|
| `schedule_vacation` | [`lib/vacation/authHandlers.ts`](../../lib/vacation/authHandlers.ts) → [`mutations.ts`](../../lib/vacation/mutations.ts) |
| `update_vacation` | same |
| `stop_vacation` | same |

Success body: `{ vacation: VacationSnapshot }`. Validation failures return **400** with `{ message: "<code>" }` (`vacation_stint_active`, `vacation_no_quota`, `vacation_invalid_range`, etc.).

---

## Core modules (node-backend)

| Module | Role |
|--------|------|
| [`lib/vacation/resolve.ts`](../../lib/vacation/resolve.ts) | Stint state, snapshots, live-window detection |
| [`lib/vacation/clockDisplay.ts`](../../lib/vacation/clockDisplay.ts) | Display seeds for games (`effectiveRemainingMs`, pause flags) |
| [`lib/vacation/dashboardClock.ts`](../../lib/vacation/dashboardClock.ts) | Dashboard game slice enrichment |
| [`lib/clockElapsed.ts`](../../lib/clockElapsed.ts) | Effective elapsed ms with vacation overlap |

### Server paths that derive live clock

| File | Notes |
|------|-------|
| [`lib/gameTimeout.ts`](../../lib/gameTimeout.ts) | Lazy sweep + `get_game`; `remainingBankMs` / `wouldTimeOut` + vacation windows |
| [`lib/games/playHandlers.ts`](../../lib/games/playHandlers.ts) | Move `timeUsed`, pie paths, opponent `timeout()` |
| [`lib/games/timeloss.ts`](../../lib/games/timeloss.ts) | Auth timeloss check |
| [`lib/profile/me.ts`](../../lib/profile/me.ts) | `nextGame` urgency sort |
| [`utils/yourturn.ts`](../../utils/yourturn.ts) | Email cron (&lt; 24h urgent) |
| [`lib/games/getGame.ts`](../../lib/games/getGame.ts) | Game payload clock display + player vacation flags |
| [`lib/meQuery.ts`](../../lib/meQuery.ts) / [`lib/profile/me.ts`](../../lib/profile/me.ts) | `me_*` vacation snapshot + dashboard game fields |

### Documented non-paths (no live turn-clock math)

| File | Reason |
|------|--------|
| [`lib/challenges/authHandlers.ts`](../../lib/challenges/authHandlers.ts), [`lib/tournaments/createTournamentPairingGame.ts`](../../lib/tournaments/createTournamentPairingGame.ts), [`lib/events/authHandlers.ts`](../../lib/events/authHandlers.ts), [`lib/games/solo.ts`](../../lib/games/solo.ts) | Initial bank at create |
| [`lib/games/playHandlers.ts`](../../lib/games/playHandlers.ts) `abandoned` | 30-day activity heuristic |
| [`lib/gameProjector.ts`](../../lib/gameProjector.ts) | `lastMoveTime` in index `sk` only |
| [`lib/botOutbound.ts`](../../lib/botOutbound.ts) | Stored bank hours for bot API |
| [`lib/dashboardGames.ts`](../../lib/dashboardGames.ts), [`lib/playerGameMarks.ts`](../../lib/playerGameMarks.ts) | Pass-through / summary |
| [`crons/src/functions/starttournaments.ts`](../../crons/src/functions/starttournaments.ts), [`crons/src/functions/standingchallenges.ts`](../../crons/src/functions/standingchallenges.ts) | Types / challenge metadata |
| [`crons/src/functions/records-move-times.ts`](../../crons/src/functions/records-move-times.ts) | Analytics on recorded move times |

Tests: `test/vacation.test.ts`, `test/clockElapsed.test.ts`, `test/vacationMutations.test.ts`, `test/vacationPublicMirror.test.ts`, `test/gameTimeout.test.ts` (vacation case).

---

## Front (apfront)

Server seeds: `clockDisplayServerTime`, per on-clock player `effectiveRemainingMs` / `clockPaused`, and **`onVacation` / `vacationScheduled`** on every player in game/dashboard payloads. Public **`user_names.onVacation`** drives list/challenge badges without an extra profile fetch; **`player_about.vacation`** drives profile copy.

| Area | Files |
|------|-------|
| Clock display | `front/src/lib/gameClockDisplay.js`; chips in `GameMove/preview/moveEntryUtils.js`, `CardTurnBar.js`; timeloss in `MoveEntry.js`, `useDockMoveEntry.js`, `useGameMoveSession.js` |
| Dashboard | `Me/MyTurnTable.js`, `TheirTurnTable.js`, `Me.js` |
| Settings | `UserSettingsModal.js`, `VacationSettingsPanel.js`, `lib/vacationApi.js` |
| Public indicators | `OnVacationBadge.js`, `Players.js`, `Player.js`, challenge pickers; profile detail via `PlayerAboutSection.js`, `PlayerVacationDetail.js`, `lib/playerVacationTooltip.js` |

Challenge **settings** modals (start/inc/max/hard) and “last activity” timestamps are unrelated to live vacation elapsed math.

**Follow-up:** optional `bin/check-clock-derivation.mjs` in the front repo mirroring backend guard patterns.

---

## Regression guard

From node-backend root:

```bash
npm run check:clock-derivation
npm run check:clock-derivation -- --strict
```

`--strict` exits non-zero when **non-allowlisted** files under `lib/` and `utils/` match forbidden live-clock patterns. The allowlist is empty for production clock paths.
