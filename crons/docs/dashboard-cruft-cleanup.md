# Dashboard cruft cleanup

Daily cron that prunes stale **index-only** dashboard rows for users inactive ≥ 1 year. Complements lazy `me()` eviction for active users and one-off ops scripts (`prune-stale-recent-completed`, `purge-usergame-orphans`).

## Schedule

| | |
|---|---|
| **Handler** | [`src/functions/dashboard-cruft-cleanup.ts`](../src/functions/dashboard-cruft-cleanup.ts) |
| **Schedule** | Daily 03:00 UTC (prod only) |
| **Timeout / memory** | 900 s / 1024 MB |
| **Layer** | No |

## What it cleans

For each eligible user (live confirm after S3 dump candidate scan):

| Partition | Action |
|-----------|--------|
| `RECENTCOMPLETED#` | Delete rows not dashboard-eligible (merged `USERGAME#` overlays) |
| `USERGAME#` | Delete overlays for pruned recent rows and orphan overlays not on `CURRENTGAMES#` ∪ eligible `RECENTCOMPLETED#` |

**Does not** touch `USER.lastSeen`, `USERS.lastSeen`, or legacy `USER.games[]` (retired in Phase 5).

## Candidate discovery (no DynamoDB scan)

1. List `abstractplay-db-dump` and pick the latest `manifest-summary.json` export uid (same pattern as [Records pipeline](/crons/pipeline/)).
2. Stream ION `USER` items from that export.
3. Collect `sk` (user id) when `lastSeen < now - 1y` and `cleaned != true`.

Dump may be up to ~24h stale; each candidate is re-validated with live `GetItem` before cleanup.

## Live processing

For up to `DASHBOARD_CRUFT_BATCH_SIZE` candidates (default 75):

1. `GetItem` `USER` — skip if active since dump, already `cleaned`, or missing.
2. Skip bots (`GetItem` `BOT`).
3. Run [`cleanupUserDashboardCruft`](../src/utils/dashboardCruftCleanup.ts) (Query + Delete only).
4. If cruft was removed, `SET cleaned = true` on `USER` (not `USERS`).

`me()` in node-backend clears `cleaned` on login so a future long absence can be cleaned again.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `ABSTRACT_PLAY_TABLE` | `abstract-play-{stage}` | DynamoDB table |
| `DASHBOARD_CRUFT_BATCH_SIZE` | `75` | Max users processed per run |
| `ABANDONED_ACCOUNT_INACTIVE_MS` | `31536000000` (365 days) | Inactivity threshold |

## Manual invoke

```bash
serverless invoke -f dashboard-cruft-cleanup --stage prod
```

Use prod with care — this deletes dashboard index rows for inactive users.

## Related

- [Live crons](/crons/live-crons/) — other live DynamoDB mutators
- [Backend database schema](/backend/database-schema/) — `USER.cleaned`
- node-backend `lib/dashboardCruftCleanup.ts` — shared cleanup logic (keep in sync)
