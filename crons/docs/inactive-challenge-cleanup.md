# Inactive challenge cleanup

Nightly live-DynamoDB cron that revokes open and direct challenges issued by players inactive ≥ 14 days, pauses matching `REALSTANDING` presets, and notifies acceptors.

## Schedule

| | |
|---|---|
| **Handler** | [`src/functions/inactive-challenge-cleanup.ts`](../src/functions/inactive-challenge-cleanup.ts) |
| **Schedule** | Daily 03:00 UTC (prod only) |
| **Timeout / memory** | 300 s / 512 MB |
| **Layer** | gameslib (metaGame UID list for `METAGAMES#` scan) |

## Discovery (challenge-centric)

1. Query `pk=USERS` (`sk`, `lastSeen`) and build `inactiveSet` (`lastSeen < now - 14d`; missing `lastSeen` → active).
2. Query `pk=CHALLENGE` (all pending direct challenges).
3. `BatchGet` `METAGAMES#{metaGame}` counts; query `STANDINGCHALLENGE#{metaGame}` only where `standingchallenges > 0`.
4. Filter challenges where `challenger.id ∈ inactiveSet`.

No S3 dump scan; cost scales with open challenge count, not inactive user count.

## Actions per candidate

1. Re-check issuer `USERS.lastSeen` (skip if logged in since discovery).
2. Revoke challenge (mirror node-backend `removeAChallenge` revocation path).
3. If standing open challenge matches a `REALSTANDING` preset entry, set `suspended: true` on that entry.
4. Notify **acceptors only** (email if prefs, push, in-app for direct challenges).

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `ABSTRACT_PLAY_TABLE` | `abstract-play-{stage}` | DynamoDB table |
| `INACTIVE_CHALLENGE_MS` | `1209600000` (14d) | Inactivity threshold |
| `INACTIVE_CHALLENGE_REVOKE_BATCH_SIZE` | unlimited | Max revokes per run (initial rollout) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | — | Web push (optional; skipped if unset) |

## Preview (read-only, local)

Before the first prod run, preview candidates without writes:

```bash
npm run preview-inactive-challenges -- --stage prod
```

Uses AWS profile `AbstractPlayProd` / table `abstract-play-prod`. Optional `--days 14` (default).

## Manual invoke

```bash
serverless invoke -f inactive-challenge-cleanup --stage prod
```

Use prod with care — this revokes live challenges.

## Related

- [Live crons](/crons/live-crons/)
- [Challenges subsystem](/backend/subsystems/challenges/)
