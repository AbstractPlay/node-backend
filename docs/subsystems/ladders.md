# Continuous delta ladders

Player-created **correspondence** ladders: one canonical board per meta game + variant series, continuous point totals (not seasons), matchmaking pool, direct challenges, and tournament-style Fischer clocks on ladder games.

## Overview

| Topic | Behavior |
|-------|----------|
| Series key | Same as single-leg `TOURNAMENTSCOUNTER` sk (`metaGame` + sorted `variants`) |
| Eligibility | Meta games that support 2-player rated play (same guard as automated tournaments) |
| Activation | `forming` until `minActiveMembers` (default 4) join; then `active` |
| Clocks | 120h max, 36h inc per move (shared with automated tournaments) |
| Ratings | Ladder games are **rated** Glicko; ladder **points** are separate from Glicko |
| Vacation | Correspondence vacation does **not** block ladder pool or challenges |

Correspondence challenges and async play are unchanged. Ladder games are tagged with `ladderId` on `GAME` and settled through `applyLadderGameEnd` on decisive game end.

## Record types

See [Database schema](/backend/database-schema/) (Ladders section). Main families:

| pk | Purpose |
|----|---------|
| `LADDER` | Board definition, `status`, `tuning`, member counts |
| `LADDERSERIES` | Series key → `ladderId` |
| `LADDERPLAYER` | Member points, caps, decay timestamps |
| `LADDERBYUSER#<userid>` | Dashboard index of active memberships |
| `LADDERGAME` | Link game → ladder; `settled` after Δ applied |
| `LADDERPOOL` | Matchmaking queue |
| `LADDERPAIR` | Rematch cooldown between two members |
| `LADDERCOMMENTS` | Hub chat log |

`CHALLENGE` rows may include `ladderId`. `CURRENTGAMES#` projects `ladderId` when present.

## Lifecycle

1. **Create** — auth `new_ladder` creates `forming` ladder and joins creator. Duplicate series returns **409** with `existingLadderId`.
2. **Join / leave** — `join_ladder` / `leave_ladder`. Rejoin after `left` keeps prior points. Leave blocked while `activeLadderGameCount > 0`.
3. **Play** — `join_ladder_pool`, `new_ladder_challenge` + `respond_ladder_challenge`, or pool pairing creates rated games via `createLadderGame`.
4. **Settle** — On win/loss/draw end, `runLadderGameEndHook` updates points (draw: no Δ), decrements active counts, enqueues `ladderPointsChange` when Δ ≠ 0.
5. **Decay** — Daily `ladder-decay` cron applies inactivity decay and `ladderDecay` notifications.

## Point deltas

Constants and formulas live in `lib/ladders/delta.ts` and per-ladder `tuning` on the `LADDER` row (copied at creation). Pace multiplier uses game duration and move count (`paceMultiplier.ts`).

## Auth queries

Documented in [Auth queries](/backend/api/auth-queries/) (Ladders section): `new_ladder`, `join_ladder`, `leave_ladder`, `get_ladder`, pool/challenge/comment RPCs. `me_dashboard` exposes `ladderMemberships`, `currentLadderGames`, and `ladderId` on active games.

## WebSockets

Clients use `watchLadders` (see [WebSockets](/backend/subsystems/websockets/)) for hub refresh; game boards use existing game watch channels.

## Notifications

| Type | When |
|------|------|
| `ladderJoin` / `ladderLeave` | Member joins or leaves (`join_ladder` / `leave_ladder`) |
| `ladderPointsChange` | Decisive settlement (`applyLadderGameEnd`); prefs `ladderPointsGain` / `ladderPointsLoss` |
| `ladderChat` | `submit_ladder_comment` |
| `ladderDecay` | Daily decay cron |

Details: [Notifications](/backend/subsystems/notifications/).

## Scheduled jobs

| Cron | Schedule (UTC) | Role |
|------|----------------|------|
| `ladder-decay` | 00:00 daily | Inactivity decay + notify |
| `ladder-reconcile-counts` | 00:01 daily | Fix `activeLadderGameCount` drift; ops S3 reports |

See [Live crons](/crons/live-crons/) and `crons/docs/functions.md`.

## Records site

Completed ladder metadata is published under `records` `event/{ladderId}.json` (crons records pipeline).

## Operations runbook

Set `ABSTRACT_PLAY_TABLE` (or use `--stage` where supported). Prefer `scripts/` CLIs over ad-hoc `bin/` scratch.

| Script | Purpose |
|--------|---------|
| `npx tsx scripts/reconcile-ladder-active-counts.ts --dry-run` | Compare/fix `activeLadderGameCount` vs open ladder games (`--live`, optional `--ladderId`) |
| `npm run backfill-ladder-by-user -- --stage dev [--live]` | Rebuild `LADDERBYUSER#` from active `LADDERPLAYER` rows |
| `npm run backfill-ladder-join-seeds -- --stage dev` (`--dry-run` / `--live`, optional `--ladderId`) | Fix join `startingPoints` / Glicko seed snapshot from `_summary-ratings` (meta UID game keys) |
| `npm run replay-ladder-member -- <ladderId> <userid>` | Replay Δ from `startingPoints` + settled games; exit 2 on mismatch (decay excluded) |
| `npx tsx scripts/audit-ladder-snapshot.ts <ladderId>` | Read-only health snapshot (members, pool, drift) |

Daily reconcile JSON: private ops S3 `ladders/reconcile/daily/YYYY-MM-DD.json` and `latest.json`. Alert on non-zero `driftCorrections` or `overCapIncidents` (`LadderActiveCountDrift` / `LadderActiveCountOverCap` metrics from the cron).

**Launch checklist (prod):**

1. Deploy API + crons; staging exercised end-to-end.
2. `reconcile-ladder-active-counts --dry-run` clean (or fixes applied with `--live`).
3. Published `/backend/subsystems/ladders/` and `docs:check` green.
4. Front: remove `VITE_LADDER_UI_DISABLED` and deploy (see front CHANGELOG).

## Related

- [Tournaments](/backend/subsystems/tournaments/) — shared series key and clock constants
- [Challenges](/backend/subsystems/challenges/) — ladder challenges reuse `CHALLENGE`
- [Games and moves](/backend/subsystems/games-and-moves/) — play and timeloss hooks
