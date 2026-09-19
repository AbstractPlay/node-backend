# Recommendation impression analytics (`records-rec-analytics`)

Nightly batch job that scans live DynamoDB `RECOMMENDS#` impression rows, computes anonymized funnel and CTR rollups, and writes reviewable artifacts to the **private ops S3 bucket**. Metrics only — no weight tuning, no front-end consumer.

## Output bucket

| Bucket | Prefix |
|--------|--------|
| `private-ops-153672715141-us-east-1-an` | `recommendations/analytics/` |

**Not** published to `records.abstractplay.com` or CloudFront.

## Schedule

**Daily 03:00 UTC** — runs in parallel with `records-cooccur` and other 03:00 batch jobs. Unlike dump consumers, this Lambda **scans DynamoDB directly** (filtered `RECOMMENDS#` partition keys).

## Inputs

| Source | Filter | Fields |
|--------|--------|--------|
| DynamoDB `abstract-play-{stage}` | `pk` begins with `RECOMMENDS#`, `sk >= watermark` | `event`, `batchId`, `surface`, `tier`, plus event-specific attributes |

Event types: `rec_show`, `rec_click`, `rec_challenge`. Schema matches [backend recommendations](/backend/subsystems/recommendations/).

### Watermark

`_state.json` stores `lastSkWatermarkMs` and processed `pk::sk` dedupe keys. Each run scans from `lastSkWatermarkMs - 5 minutes` (overlap buffer), skips keys already counted, then advances the watermark.

First run (no state): looks back **7 days**.

## Algorithm

1. **Ingest** — parse DynamoDB items; strip `userId` from `pk` immediately (never written to output).
2. **Batch join** on `batchId` — funnel counts, orphan clicks, duplicate detection.
3. **Dimensional rollups** — `surface`, `tier`, `reasonType`, top meta-games (cap 30), position histogram (0–7).
4. **Rates** — CTR, challenge rate, end-to-end rate; dimensional CTR only when shows ≥ 20.
5. **Daily files** — merge new events into `daily/YYYY-MM-DD.json` (UTC from `sk` epoch).
6. **Rolling windows** — recompute `rolling7d` and `rolling30d` from retained daily files (~90 days).

Implementation: [`src/utils/recAnalytics.ts`](../src/utils/recAnalytics.ts). Handler: [`src/functions/records-rec-analytics.ts`](../src/functions/records-rec-analytics.ts).

## S3 layout

| Key | Purpose |
|-----|---------|
| `recommendations/analytics/_state.json` | `lastRunAt`, `lastSkWatermarkMs`, `processedKeys` |
| `recommendations/analytics/daily/YYYY-MM-DD.json` | UTC day slice |
| `recommendations/analytics/summary.json` | Latest window + rolling 7d/30d |
| `recommendations/analytics/report/YYYY-MM-DD.md` | Human/agent-readable report |

## `summary.json` schema (illustrative)

```json
{
  "generatedAt": "2026-08-13T03:15:00.000Z",
  "window": { "start": "2026-08-12T03:00:00.000Z", "end": "2026-08-13T03:15:00.000Z" },
  "totals": { "shows": 420, "clicks": 38, "challenges": 5 },
  "rates": { "ctr": 0.09, "challengeRate": 0.132, "endToEndRate": 0.012 },
  "bySurface": { "gamePicker": { "shows": 400, "clicks": 36, "ctr": 0.09 } },
  "byTier": { "warm": { "shows": 310, "clicks": 32, "ctr": 0.103 } },
  "byReasonType": { "content": { "clicks": 18, "showReasons": 200 } },
  "topClickedMetaGames": [{ "metaGame": "go", "count": 4 }],
  "topChallengedMetaGames": [],
  "positionHistogram": { "0": 12, "1": 8 },
  "rolling7d": { "totals": { "shows": 0, "clicks": 0, "challenges": 0 }, "rates": {} },
  "rolling30d": {},
  "dataQuality": { "eventsProcessed": 500, "parseErrors": 0, "orphanClicks": 2, "duplicateEventsPerBatch": 0 }
}
```

Published objects contain **only aggregates** — no user IDs, no raw `batchId` values.

## Privacy

- Raw events remain in DynamoDB with ~90-day TTL.
- Ops S3 artifacts are aggregate-only and private (IAM-restricted).

## Manual invoke

```bash
# dev
serverless invoke -f records-rec-analytics --stage dev

# prod
serverless invoke -f records-rec-analytics --stage prod
```

Fetch results (requires AWS credentials with ops bucket access):

```bash
aws s3 cp s3://private-ops-153672715141-us-east-1-an/recommendations/analytics/summary.json -
aws s3 cp s3://private-ops-153672715141-us-east-1-an/recommendations/analytics/report/2026-08-13.md -
```

## Related

- [Recommendation co-occurrence](/crons/recommendations-cooccur/) — PMI matrix for the live recommender
- [Backend recommendations](/backend/subsystems/recommendations/) — event write path
- [Live crons](/crons/live-crons/) — other direct DynamoDB jobs
