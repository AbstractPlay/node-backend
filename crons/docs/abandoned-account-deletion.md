# Abandoned account deletion

Daily cron (prod, batched) that **fully deletes** human accounts inactive ≥ 1 year with **no game participation**, after live confirmation. Distinct from [dashboard cruft cleanup](/crons/dashboard-cruft-cleanup/) (index prune only).

## Schedule

| | |
|---|---|
| **Handler** | [`src/functions/abandoned-account-deletion.ts`](../src/functions/abandoned-account-deletion.ts) |
| **Schedule** | Daily **03:30 UTC** (prod only) |
| **Timeout / memory** | 900 s / 1024 MB |

## Eligibility

**Inactive:** `USER.lastSeen` numeric and older than `ABANDONED_ACCOUNT_INACTIVE_MS` (default 365 days).

**Hard blockers (skip user):** any `COMPLETEDGAMES#<userId>`, `CURRENTGAMES#<userId>`, or seated `ARENAUSER` row. Registered display name required; skip bots and admins.

**Soft defer:** open `CHALLENGE` / `REALSTANDING` involvement → skip with `open_challenge` until [inactive-challenge-cleanup](/crons/inactive-challenge-cleanup/) clears them.

**Not blockers:** tournament / ladder / org registrations — **detached** during delete via [`lib/abandonedAccountDeletion.ts`](../../lib/abandonedAccountDeletion.ts).

## Candidate discovery

Same S3 ION export as dashboard cruft (`abstractplay-db-dump`). Shared collector: [`lib/abandonedAccountDumpCandidates.ts`](../../lib/abandonedAccountDumpCandidates.ts) / [`dumpExport.ts`](../src/utils/dumpExport.ts).

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `ABANDONED_ACCOUNT_DELETE_ENABLED` | `false` | Must be `true` to run deletes |
| `ABANDONED_ACCOUNT_DELETE_DRY_RUN` | `true` | Log only; no DDB/Cognito mutations |
| `ABANDONED_ACCOUNT_DELETE_BATCH_SIZE` | `25` | Max users per run |
| `ABANDONED_ACCOUNT_INACTIVE_MS` | `31536000000` | Inactivity threshold |
| `USERPOOL_ID` | stage pool id | Cognito `AdminDeleteUser` |
| `ABSTRACT_PLAY_TABLE` | `abstract-play-{stage}` | Main table |
| `FEEDBACK_TABLE` | `abstract-play-feedback-{stage}` | Removes `USER#` index partition |

## Sizing (read-only)

From repo root (requires AWS profile with S3 access to `abstractplay-db-dump`; export is large):

```bash
npm run list-abandoned-account-candidates -- --download
npm run list-abandoned-account-candidates -- --dump-dir .local/abandoned-account-ion-dump/<exportUid> --out bin/abandoned-account-candidates.json --csv --include-deferred
```

## Manual single-user delete

```bash
npm run abandoned-account-deletion -- --stage prod --user-id <cognito-sub> --dry-run
npm run abandoned-account-deletion -- --stage prod --user-id <cognito-sub> --apply
```

## Rollout

1. Run list script; review candidate counts.
2. Deploy with `ABANDONED_ACCOUNT_DELETE_ENABLED=false`, `DRY_RUN=true`.
3. Manual `--apply` on one dev user, then enable prod with small batch.

## Related

- [Live crons](/crons/live-crons/)
- [Backend database schema](/backend/database-schema/) — account removal vs `USER.cleaned`
