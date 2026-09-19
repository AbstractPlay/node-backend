# S3 outputs

Static artifacts are published to **`records.abstractplay.com`** (S3 + CloudFront). DynamoDB exports land in **`abstractplay-db-dump`** daily (`dumpdb`); batch jobs read the latest completed export.

## Records bucket layout

| Key pattern | Producer | Description |
|-------------|----------|-------------|
| `ALL.json` | `records` | Array of all [`APGameRecord`](/recranks/) objects |
| `_summary.json` | `summarize` | Full site-wide analytics monolith — see [Summarize](/crons/summarize/) |
| `_summary-site.json` | `summarize` | Tier 0 site overview (lazy-load bootstrap) |
| `_summary-players.json` | `summarize` | Tier 1 per-player bulk stats |
| `_summary-ratings.json` | `summarize` | Tier 2 ratings bulk (Glicko-enriched) |
| `player/{playerId}-summary.json` | `player-summary-worker` | Per-player summary slice (~few KB) |
| `_summary-player-manifest.json` | `player-summary-fanout` | Fan-out manifest v2: `candidateCount`, `expectedCount` (enqueued this run), `skippedCount`, `inputFingerprint`, `contentHashes` |
| `_manifest.json` | `records-manifest` | S3 object listing + `summaryFiles` (v2) |
| `meta/{metaGame}.json` | `records` | Game records filtered by meta game name |
| `player/{playerId}.json` | `records` | Game records for one player |
| `event/{eventId}.json` | `records` | Game records for a tournament or org event |
| `ttm/{playerId}.json` | `records-ttm` | Array of inter-move durations (milliseconds) |
| `mvtimes.json` | `records-move-times` | Move activity counts by meta game and time window |
| `recommendations/cooccur.json` | `records-cooccur` | PMI co-occurrence matrix for game recommendations |
| `tournament-summary.json` | `tournament-data` | Per-player tournament aggregate stats |
| `player/tournaments/{playerId}.json` | `tournament-data` | Individual tournament results for one player |

## Game record format

Each record in `ALL.json`, `meta/`, `player/`, and `event/` files conforms to the **APGameRecord** schema documented in [Recranks](/recranks/). Records are produced by calling `GameFactory(metaGame, state).genRecord(...)` in [`records.ts`](../src/functions/records.ts).

Key header fields used downstream:

- `header.site.gameid` — stable composite id (see below); summarize parses meta UID and variant codes from this field
- `header.game.name` — meta game display name (human-readable; not used as summarize map keys)
- `header.game.variants` — localized variant labels at record-generation time
- `header.players[].userid` — player ID
- `header["date-start"]`, `header["date-end"]` — ISO timestamps
- `moves` — move history (timeout/abandoned detection in summarize)

### Game record `gameid`

`header.site.gameid` is set in [`records.ts`](../src/functions/records.ts) via `encodeRecordGameId()` ([`recordGameId.ts`](../src/utils/recordGameId.ts)):

| Format | Example | Notes |
|--------|---------|-------|
| Current | `{uuid}#{metaGame}:{sortedVariantUids}` | Variant UIDs joined with `\|`; trailing colon when no variants (`…#chess:`) |
| Legacy | `{metaGame}#{uuid}` | Pre-encoding records; summarize treats variant codes as unknown |

Parse/decode helpers: `parseRecordGameId`, `encodeRecordGameId`, `variantComboKey` in [`src/utils/recordGameId.ts`](../src/utils/recordGameId.ts).

### Summary `game` keys

`_summary*.json` map keys and `ratings.highest[].game` strings use **meta game UIDs**, not display names:

| Key shape | Example |
|-----------|---------|
| Meta only | `go` |
| Meta + variants | `go (size-9)` |
| Implicit defaults (variant groups) | `akimbo (#board\|#ruleset)` — empty `gameid` variant segment uses `#group` sentinels via gameslib `variantUidsForBatchRating` |
| Explicit no variants | `chess (no variants)` — only when the meta game has **no** `gameinfo.variants` dimension |

Front-end clients resolve UIDs to localized display names via gameslib (`src/lib/summaryGameKeys.js` in the front repo).

## `_summary.json` and tier files

The **monolith** (`_summary.json`) is typed as `StatSummary` in [`src/types/stats/StatSummary.ts`](../src/types/stats/StatSummary.ts). Tier types: [`StatSummaryTiers.ts`](../src/types/stats/StatSummaryTiers.ts).

| Key | Type | Role |
|-----|------|------|
| `_summary.json` | `StatSummary` | Full superset; backward compatible download / batch consumers |
| `_summary-site.json` | `StatSummarySite` | Site stats, geo, histograms (site keys), `metaStats`, `plays`, `topPlayers` |
| `_summary-players.json` | `StatSummaryPlayers` | `players.*` + `histograms.players` / `playerTimeouts` + `pastDisplayNames` (per-user alias list from record headers) |
| `_summary-ratings.json` | `StatSummaryRatings` | `ratings.*` including Glicko aggregates |
| `player/{userId}-summary.json` | `PlayerSummarySlice` | One user's Tier 1/2 subset; optional `pastDisplayNames` (distinct embedded record names excluding current `USERS.name`) |

All JSON objects use `Content-Type: application/json`. Each tier/slice includes `generated` (ISO timestamp).

### Monolith top-level fields

| Field | Meaning |
|-------|---------|
| `numGames`, `numPlayers` | Totals from `ALL.json` |
| `oldestRec`, `newestRec` | Date range of completed games |
| `timeoutRate` | Fraction of games with clock timeout **or** abandonment |
| `abandonedRate` | Fraction of games closed by abandonment only |
| `playContext` | Casual vs tournament/org-event game counts |
| `pieRates` | Pie invocation rates for supported meta games |
| `playerCountMix` | Player-count distribution for multi-player metas |
| `ratings` | ELO/Glicko/Trueskill aggregates (`highest`, `avg`, `weighted`, `glickoByGame`, `glickoSite`, `glickoMeta`) |
| `topPlayers` | Top-rated player/game pairs |
| `plays`, `players` | Game and player activity rankings |
| `histograms` | Play-count distributions, first-timers, returning players, weekly active movers, timeout/abandonment rates |
| `metaStats` | Per-game two-player stats (length, first-player win rate, draw rate) |
| `geoStats` | Registered user counts by country (from live USERS table) |
| `activeGeoStats` | Players who completed a game in the past 30 days, by profile country |
| `rivalries` | Two-player pair frequencies (≥50 shared games); anonymized unless both players opted in (`players` array when named) |
| `seasonality` | Move-time activity by UTC day/hour (from `mvtimes.json`; last 365 days) |
| `hoursPer` | `{ mean, median, n, byWeek }` — winsorized (p2–p98) hours per move site-wide |

Full field documentation: [Summarize](/crons/summarize/).

### `_summary-player-manifest.json` (fan-out manifest v2)

Written by `player-summary-fanout` after each run:

| Field | Meaning |
|-------|---------|
| `version` | `2` |
| `generated` | Same `generated` timestamp as tier files |
| `enqueuedAt` | ISO timestamp when fan-out finished |
| `candidateCount` | All-time players considered for slices |
| `expectedCount` | SQS messages enqueued this run (changed slices only) |
| `skippedCount` | Candidates skipped because slice content hash matched prior run |
| `inputFingerprint` | SHA-256 of substantive tier content (excludes `generated` / `tier`) |
| `contentHashes` | Per-user slice content hashes for the next run's skip logic |

First deploy after this change enqueues all candidates (no v2 manifest yet). Legacy v1 manifests are treated as having no stored hashes.

## `mvtimes.json`

Produced by `records-move-times`. Object with:

| Key | Meaning |
|-----|---------|
| `raw1w`, `raw1m`, `raw6m`, `raw1y` | Move counts by meta game in each rolling window |
| `players1w`, … | Distinct active players by meta game per window |
| `playersSum1w`, … | Cumulative unique-player scores by meta game |
| `seasonality` | Site-wide move activity bins (last 365 days): `{ movesByDow, playersByDow, movesByHour, windowDays }` |
| `weeklyActiveMovers` | `{ originMs, byWeek }` — distinct players with ≥1 move per seven-day bucket (same origin as completion histograms; move data ~1y) |

`summarize` copies `seasonality` and aligns `weeklyActiveMovers` into `_summary.json` (`histograms.activeMovers`).

## `recommendations/cooccur.json`

PMI-normalized co-occurrence neighbors per meta-game for the hybrid recommender. Includes optional stars boost (`includeStarredBoost`). Full schema and algorithm: [Recommendation co-occurrence](/crons/recommendations-cooccur/).

## Private ops bucket (`private-ops-153672715141-us-east-1-an`)

Not served via CloudFront. IAM-restricted.

| Key pattern | Producer | Description |
|-------------|----------|-------------|
| `recommendations/analytics/_state.json` | `records-rec-analytics` | Watermark and dedupe state |
| `recommendations/analytics/daily/YYYY-MM-DD.json` | `records-rec-analytics` | UTC daily impression rollups |
| `recommendations/analytics/summary.json` | `records-rec-analytics` | Latest window + rolling 7d/30d |
| `recommendations/analytics/report/YYYY-MM-DD.md` | `records-rec-analytics` | Human/agent-readable report |
| `stats/rivalries.json` | `summarize` | All qualifying rivalry pairs with user IDs and display names (not anonymized; min 5 shared games) |

**Retired (preview-era layout feedback):** `gamemove-layout/analytics/*` on private ops S3 is an archived snapshot from the removed `layout-feedback-analytics` cron. No new writes after teardown; DynamoDB `LAYOUTFB#*` rows are purged via `node-backend` `bin/purge-layout-feedback-events.mjs`.

See [Recommendation analytics](/crons/recommendations-analytics/) and [Summarize](/crons/summarize/).

## Dump bucket layout

Exports from `dumpdb` appear under:

```
AWSDynamoDB/{export-uid}/manifest-summary.json
AWSDynamoDB/{export-uid}/data/*.ion.gz
```

Batch functions locate the newest `manifest-summary.json`, extract the UID, and read all `data/*.gz` files for that export.

## `_manifest.json` (v2)

Typed in [`src/utils/recordsManifest.ts`](../src/utils/recordsManifest.ts). The records bucket manifest is no longer a bare S3 `Contents` array.

```typescript
{
  version: 2,
  generated: string,          // ISO timestamp when manifest was built
  summaryFiles: {
    monolith:  { key, lastModified?, size? },
    site:      { key, lastModified?, size? },
    players:   { key, lastModified?, size? },
    ratings:   { key, lastModified?, size? },
    playerSummaryPattern: "player/{userId}-summary.json",
    playerManifest: { key: "_summary-player-manifest.json", ... }
  },
  objects: _Object[]            // full bucket listing (same data as legacy root array)
}
```

**Backward compatibility:** legacy consumers expecting a root array should use `Array.isArray(data) ? data : data.objects`.

`records-manifest` runs at **04:00** and **07:30 UTC** (late pass is after `summarize` at 06:00 and `player-summary-fanout` at 06:15). The handler logs a warning if any required `_summary*.json` tier key is missing from the listing.

## CloudFront and caching

**Distribution:** `EM4FVU08T5188` — `https://records.abstractplay.com`

CloudFront **does not** run blanket `/*` invalidations (removed to avoid quota/cost issues). Freshness relies on S3 object headers set by crons.

### S3 cache headers (all records-bucket JSON)

| Object type | `Cache-Control` | `Content-Type` |
|-------------|-----------------|----------------|
| Daily batch JSON (`ALL.json`, `meta/*`, `player/*`, `_summary*.json`, etc.) | `public, max-age=0, must-revalidate` | `application/json` |
| `_manifest.json` | `no-cache` | `application/json` |

After each daily cron overwrite, the next CDN/browser request revalidates with S3 (`If-None-Match`); changed objects return a new body without invalidation.

Implemented in [`src/utils/recordsJson.ts`](../src/utils/recordsJson.ts) (`putRecordsJson`).

### Gzip compression

CloudFront compresses responses only when the **origin** returns a compressible `Content-Type` (e.g. `application/json`). Objects previously uploaded as `application/octet-stream` were not compressed.

1. **Crons** — set `Content-Type: application/json` on upload (above).
2. **CloudFront** — enable **Compress objects automatically** on the default cache behavior.

One-time enable (prod credentials):

```bash
npm run enable-records-cdn-compress
# preview: npm run enable-records-cdn-compress -- --dry-run
```

Or in the AWS Console: CloudFront → distribution `EM4FVU08T5188` → **Behaviors** → Edit default → **Compress objects automatically: Yes**.

Verify after deploy + CF propagation:

```bash
curl.exe -sI -H "Accept-Encoding: gzip" https://records.abstractplay.com/_summary-site.json
```

Expect `Content-Encoding: gzip` and `Content-Length` much smaller than the uncompressed object.

Clients should use `_manifest.json` `summaryFiles` or tier URLs rather than hard-coding cache assumptions.

## Related

- [Records pipeline](/crons/pipeline/)
- [Recommendation co-occurrence](/crons/recommendations-cooccur/)
- [Recommendation analytics](/crons/recommendations-analytics/)
- [Recranks schema reference](/recranks/schema-reference/)
- [Functions reference](/crons/functions/)
