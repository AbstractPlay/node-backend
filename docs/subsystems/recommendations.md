# Recommendation impression events

The front-end game recommender logs **impression events** for logged-in users so offline batch jobs can measure show/click/challenge rates and tune hybrid weights over time. Events are **write-only** at request time — the live recommender never reads them.

## Auth API

**Query:** `log_recommendation_event`

Handler derives the partition key from the authenticated user (`cognitoPoolClaims.sub`). The client never sends a partition key.

```json
{
  "query": "log_recommendation_event",
  "pars": {
    "event": "rec_click",
    "batchId": "550e8400-e29b-41d4-a716-446655440000",
    "surface": "gamePicker",
    "tier": "warm",
    "metaGame": "amazons",
    "position": 2,
    "reasonType": "cooccur"
  }
}
```

### Event types

| Event | When | Required `pars` beyond common fields |
|-------|------|--------------------------------------|
| `rec_show` | Recommendation list rendered (once per batch) | `gameIds[]`, `reasons[]` (same length) |
| `rec_click` | User selects a recommended game | `metaGame`, `position` (0-based), `reasonType` |
| `rec_challenge` | Challenge created from a rec surface | `metaGame` |

Common fields for all events: `event`, `batchId`, `surface`, `tier`.

### `surface` values

`gamePicker` | `explore` | `dashboard` (extensible).

### `reasonType` values (clicks)

`content` | `cooccur` | `popularity` | `new`

### `tier` values

`cold` | `warm` — matches the recommender tier at render time.

`batchId` is a client-generated UUID per recommendation render; it links `rec_show` → `rec_click` → `rec_challenge` in offline analysis. It is stored as an attribute only — **no GSI**.

## DynamoDB storage

Single-table layout in `abstract-play-{stage}`:

| Key | Value |
|-----|-------|
| pk | `RECOMMENDS#<userid>` |
| sk | `<epochMs>#<random>` — unique per event |

Attributes: `event`, `batchId`, `surface`, `tier`, `expiresAt`, plus event-specific fields (`metaGame`, `position`, `reasonType`, `gameIds`, `reasons`).

- **No GSI** — events are exported and aggregated nightly, not queried live per user or per `batchId`.
- **TTL:** `expiresAt` (Unix epoch seconds, ~90 days). DynamoDB TTL is enabled on this attribute at the table level.
- **Rate limit:** 50 events per user per UTC calendar day (server-side).

Implementation: [`lib/recommendationEvents.ts`](../../lib/recommendationEvents.ts), wired from [`api/abstractplay.ts`](../../api/abstractplay.ts).

## Offline read path (planned)

Nightly, as part of the records/stats batch:

1. Export recommendation events from DynamoDB → S3.
2. Aggregate CTR by `surface`, `reasonType`, `tier`.
3. Optionally emit `recommendations/tuning.json` with updated hybrid weights.

The live recommender continues to use static nightly artifacts (`cooccur.json`, `mvtimes.json`, gameslib tags, player records) — not impression rows.

## Privacy

- Authenticated users only (unauthenticated requests are rejected by the auth API).
- No PII beyond the authenticated `userId` embedded in `pk`.
- Raw events expire after ~90 days; aggregates in S3 may live longer.

## Related

- [Database schema](/backend/database-schema/) — `RECOMMENDS#` key family
- [Auth queries](/backend/api/auth-queries/) — query table entry
- Front-end recommender (separate repo) — Phase 4b client tracking
