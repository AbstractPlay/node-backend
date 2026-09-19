# Functions reference

All handlers live in [`src/functions/`](https://github.com/AbstractPlay/backend-crons/tree/develop/src/functions). Schedules and resource limits are in [`serverless.yml`](../serverless.yml).

Batch dump consumers run **daily at 03:00 UTC** and read the latest completed ION export (see [Records pipeline](/crons/pipeline/)).

## Batch functions (S3 / dump)

### `dumpdb`

| | |
|---|---|
| **Handler** | `src/functions/dumpdb.ts` |
| **Schedule** | Daily 00:00 UTC |
| **Timeout / memory** | 1024 MB (default) |
| **Layer** | No |
| **Input** | EventBridge event (unused) |
| **Output** | DynamoDB export to `abstractplay-db-dump` (ION) |
| **Notes** | Exports `abstract-play-prod` table only; prunes exports older than 7 days |

### `records`

| | |
|---|---|
| **Handler** | `src/functions/records.ts` |
| **Schedule** | Daily 03:00 UTC |
| **Timeout / memory** | 900 s / 10240 MB |
| **Layer** | gameslib |
| **Input** | Latest ION dump |
| **Output** | `ALL.json`, `meta/*.json`, `player/*.json`, `event/*.json` |
| **Notes** | Uses `GameFactory`, `genRecord`, `addResource`; marks AI players via BOT records |

### `records-ttm`

| | |
|---|---|
| **Handler** | `src/functions/records-ttm.ts` |
| **Schedule** | Daily 03:00 UTC |
| **Timeout / memory** | 900 s / 10240 MB |
| **Layer** | gameslib |
| **Input** | Latest ION dump (GAME records) |
| **Output** | `ttm/{playerId}.json` — array of move-to-move durations (ms) |

### `records-move-times`

| | |
|---|---|
| **Handler** | `src/functions/records-move-times.ts` |
| **Schedule** | Daily 03:00 UTC |
| **Timeout / memory** | 900 s / 10240 MB |
| **Layer** | gameslib |
| **Input** | Latest ION dump (GAME + MOVE records) |
| **Output** | `mvtimes.json` — activity histograms by meta game plus move-time seasonality |

### `records-cooccur`

| | |
|---|---|
| **Handler** | `src/functions/records-cooccur.ts` |
| **Schedule** | Daily 03:00 UTC |
| **Timeout / memory** | 900 s / 10240 MB |
| **Layer** | No |
| **Input** | Latest ION dump (completed GAME + USER `stars[]`) |
| **Output** | `recommendations/cooccur.json` — PMI co-occurrence matrix |
| **Notes** | See [Recommendation co-occurrence](/crons/recommendations-cooccur/) |

### `records-rec-analytics`

| | |
|---|---|
| **Handler** | `src/functions/records-rec-analytics.ts` |
| **Schedule** | Daily 03:00 UTC |
| **Timeout / memory** | 900 s / 1024 MB |
| **Layer** | No |
| **Input** | Live DynamoDB scan (`RECOMMENDS#*`) |
| **Output** | `recommendations/analytics/*` on private ops S3 |
| **Notes** | See [Recommendation analytics](/crons/recommendations-analytics/) |

### `tournament-data`

| | |
|---|---|
| **Handler** | `src/functions/tournament-data.ts` |
| **Schedule** | Daily 03:00 UTC |
| **Timeout / memory** | 900 s / 10240 MB |
| **Layer** | No |
| **Input** | Latest ION dump (TOURNAMENT / COMPLETEDTOURNAMENT records) |
| **Output** | `tournament-summary.json`, `player/tournaments/{playerId}.json` |

### `records-manifest`

| | |
|---|---|
| **Handler** | `src/functions/records-manifest.ts` |
| **Schedule** | Daily 04:00 and 07:30 UTC |
| **Timeout / memory** | 900 s / 10240 MB |
| **Layer** | gameslib (attached but no gameslib import) |
| **Input** | S3 list on records bucket |
| **Output** | `_manifest.json` (v2: `summaryFiles` + `objects`); `Cache-Control: no-cache` |

### `summarize`

| | |
|---|---|
| **Handler** | `src/functions/summarize.ts` |
| **Schedule** | Daily 06:00 UTC |
| **Timeout / memory** | 900 s / 5120 MB |
| **Layer** | gameslib |
| **Input** | `ALL.json`; `mvtimes.json` (seasonality); live `USERS` query for geo stats |
| **Output** | `_summary.json`, `_summary-site.json`, `_summary-players.json`, `_summary-ratings.json`; `stats/rivalries.json` on private ops bucket |
| **Notes** | See [Summarize](/crons/summarize/) |

### `player-summary-fanout`

| | |
|---|---|
| **Handler** | `src/functions/player-summary-fanout.ts` |
| **Schedule** | Daily 06:15 UTC |
| **Timeout / memory** | 300 s / 1024 MB |
| **Layer** | gameslib |
| **Input** | `_summary-site.json`, `_summary-players.json`, `_summary-ratings.json`; previous `_summary-player-manifest.json` (optional) |
| **Output** | SQS messages (changed player slices only); `_summary-player-manifest.json` v2 |
| **Return** | `candidateCount`, `enqueuedCount`, `skippedCount`, `inputUnchanged`, `tierBytesLoaded`, `manifestBytes` |

### `player-summary-worker`

| | |
|---|---|
| **Handler** | `src/functions/player-summary-worker.ts` |
| **Trigger** | SQS (`PlayerSummaryQueue`, batch 5) |
| **Timeout / memory** | 30 s / 256 MB |
| **Concurrency** | 25 reserved |
| **Output** | `player/{userId}-summary.json` |

## Live functions (DynamoDB)

### `starttournaments`

| | |
|---|---|
| **Handler** | `src/functions/starttournaments.ts` |
| **Schedule** | Daily 10:00 and 22:00 UTC |
| **Timeout / memory** | 600 s / 1024 MB |
| **Layer** | gameslib |
| **Input** | `TOURNAMENT` records in DynamoDB |
| **Output** | Creates/cancels tournaments, starts games via `GameFactory`, sends SES emails |
| **Notes** | See [Live crons](/crons/live-crons/) |

### `inactive-challenge-cleanup`

| | |
|---|---|
| **Handler** | `src/functions/inactive-challenge-cleanup.ts` |
| **Schedule** | Daily 03:00 UTC |
| **Timeout / memory** | 300 s / 512 MB |
| **Layer** | gameslib |
| **Input** | Live `USERS`, `CHALLENGE`, `STANDINGCHALLENGE#`, `METAGAMES#` |
| **Output** | Revokes stale challenges, pauses `REALSTANDING`, acceptor notifications |
| **Notes** | See [Inactive challenge cleanup](/crons/inactive-challenge-cleanup/) |

### `standingchallenges`

| | |
|---|---|
| **Handler** | `src/functions/standingchallenges.ts` |
| **Schedule** | Daily 00:00 and 12:00 UTC |
| **Timeout / memory** | 600 s / 1024 MB |
| **Layer** | No |
| **Input** | `REALSTANDING` preset records |
| **Output** | Issues standing challenge requests in DynamoDB |
| **Notes** | See [Live crons](/crons/live-crons/) |

### `dashboard-cruft-cleanup`

| | |
|---|---|
| **Handler** | `src/functions/dashboard-cruft-cleanup.ts` |
| **Schedule** | Daily 03:00 UTC |
| **Timeout / memory** | 900 s / 1024 MB |
| **Layer** | No |
| **Input** | Latest ION dump (`USER` candidates) + live DynamoDB confirm |
| **Output** | Deletes stale `RECENTCOMPLETED#` / orphan `USERGAME#`; sets `USER.cleaned` |
| **Notes** | See [Dashboard cruft cleanup](/crons/dashboard-cruft-cleanup/) |

## Related

- [Records pipeline](/crons/pipeline/)
- [S3 outputs](/crons/s3-outputs/)
- [Recommendation co-occurrence](/crons/recommendations-cooccur/)
- [Architecture](/crons/architecture/)
