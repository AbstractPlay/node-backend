# Live crons

Functions that operate on **live DynamoDB** rather than only writing static artifacts. Most run on prod schedules and mutate data directly.

## `dashboard-cruft-cleanup`

**Schedule:** 03:00 UTC daily  
**Source:** [`src/functions/dashboard-cruft-cleanup.ts`](../src/functions/dashboard-cruft-cleanup.ts)

Prunes stale dashboard index cruft (`RECENTCOMPLETED#`, orphan `USERGAME#`) for users inactive ≥ 1 year. Candidates come from the daily S3 ION dump; each user is confirmed live before cleanup. Sets `USER.cleaned = true` (cleared on `me()` login in node-backend).

See [Dashboard cruft cleanup](/crons/dashboard-cruft-cleanup/) for full detail.

## `starttournaments`

**Schedule:** 10:00 and 22:00 UTC daily  
**Source:** [`src/functions/starttournaments.ts`](../src/functions/starttournaments.ts)

### Purpose

Automates the tournament lifecycle:

1. Find tournaments that are ready to start (enough registered players, scheduled start time reached)
2. Cancel tournaments that cannot start (insufficient players)
3. Create initial games for started tournaments via `GameFactory`
4. Send notification emails through SES

### DynamoDB access

Queries and updates `TOURNAMENT` records on `abstract-play-{stage}`. Uses retry logic for throttling (`ThrottlingException`, etc.).

### Gameslib integration

- `gameinfo` — tournament-capable meta games and variant validation
- `GameFactory` — instantiate games from tournament configuration
- `GameBase` / `GameBaseSimultaneous` — create first moves for simultaneous-start games

### Email / i18n

Uses i18next with `apback` strings under `src/locales/` (exported from node-backend at build/CI time; see [Getting started](/crons/getting-started/#email-strings-apback)). Email templates reference tournament name, meta game, and player lists.

### Related backend docs

- [Tournaments subsystem](/backend/subsystems/tournaments/)
- [Database schema](/backend/database-schema/) — `TOURNAMENT` record shape

### Manual invoke

Scheduled runs sweep all eligible tournaments. For a **single tournament** (including resume after a partial start):

```bash
serverless invoke -f starttournaments --stage prod --path invoke-resume.json
```

Example `invoke-resume.json`:

```json
{"tournamentId":"<uuid>","resume":true}
```

Resume requires `started: false`. Tournament start is **not** exposed via node-backend queries or the admin dashboard — only this Lambda. Ad-hoc prod ops scripts live under `bin/` (gitignored, local only), e.g. `bin/check-tournament-prod.mjs`, `bin/cleanup-tournament-prod.mjs`.

## `inactive-challenge-cleanup`

**Schedule:** 03:00 UTC daily  
**Source:** [`src/functions/inactive-challenge-cleanup.ts`](../src/functions/inactive-challenge-cleanup.ts)

Revokes open (`STANDINGCHALLENGE#`) and direct (`CHALLENGE`) challenges issued by players inactive ≥ 14 days (`USERS.lastSeen`). Pauses matching `REALSTANDING` presets and notifies acceptors (email, push, in-app for direct).

See [Inactive challenge cleanup](/crons/inactive-challenge-cleanup/) for full detail.

## `standingchallenges`

**Schedule:** 00:00 and 12:00 UTC daily  
**Source:** [`src/functions/standingchallenges.ts`](../src/functions/standingchallenges.ts)

### Purpose

Processes **preset standing challenge** requests stored as `REALSTANDING` records. When conditions are met (matching players online, preset rules satisfied), the cron creates challenge records in DynamoDB so the normal challenge flow in node-backend can pick them up.

### DynamoDB access

Queries `REALSTANDING` and related user/challenge records. Does not use gameslib — pure DynamoDB document operations.

### Related backend docs

- [Challenges subsystem](/backend/subsystems/challenges/)

## Dev vs prod

Both functions deploy to dev stacks but **EventBridge schedules are disabled on dev**. Test by invoking manually:

```bash
serverless invoke -f dashboard-cruft-cleanup --stage prod
serverless invoke -f inactive-challenge-cleanup --stage prod
serverless invoke -f starttournaments --stage prod
serverless invoke -f standingchallenges --stage prod
```

Use prod with care — these mutate live data.

## Related

- [Functions reference](/crons/functions/)
- [Architecture](/crons/architecture/)
- [Deployment](/crons/deployment/)
