# Game Move layout feedback events

The beta Game Move layouts (strip, card, narrative) log **feedback events** for logged-in users so offline batch jobs can measure satisfaction, bailouts, layout switches, and qualitative notes. Events are **write-only** at request time.

## Auth API

**Query:** `log_layout_feedback_event`

Handler derives the partition key from the authenticated user (`cognitoPoolClaims.sub`). The client never sends a partition key.

```json
{
  "query": "log_layout_feedback_event",
  "pars": {
    "event": "feedback_note",
    "layoutId": "card",
    "comment": "Submit button hard to find on mobile",
    "gameId": "abc123",
    "durationMs": 45000
  }
}
```

### Event types

| Event | When | Required `pars` beyond `layoutId` |
|-------|------|-----------------------------------|
| `session_start` | Feedback panel opens | — |
| `feedback` | Thumbs up/down | `rating` (`up` \| `down`) |
| `feedback_note` | User clicks Post on a comment | `comment` (1–500 chars trimmed) |
| `switch_to_classic` | User returns to classic layout | — |
| `layout_switch` | User switches beta layout | `toLayoutId` |

Optional on all events: `gameId`, `durationMs` (non-negative integer).

### `layoutId` / `toLayoutId` values

`strip` | `card` | `narrative`

## DynamoDB storage

Single-table layout in `abstract-play-{stage}`:

| Key | Value |
|-----|-------|
| pk | `LAYOUTFB#<userid>` |
| sk | `<epochMs>#<random>` — unique per event |

Attributes: `event`, `layoutId`, plus event-specific fields (`rating`, `comment`, `toLayoutId`, `gameId`, `durationMs`).

- **No GSI** — events are exported and aggregated nightly, not queried live.
- **No TTL** — items persist until manual purge when the layout experiment concludes.
- **No rate limit** — small user base; server validates payload shape and comment length only.

Implementation: [`lib/layoutFeedbackEvents.ts`](../../lib/layoutFeedbackEvents.ts), wired from [`api/abstractplay.ts`](../../api/abstractplay.ts).

## Offline read path

Nightly `records-layout-feedback-analytics` (backend-crons) scans `LAYOUTFB#` rows, aggregates rollups and copies note text to private ops S3 (`gamemove-layout/analytics/`). See [Game Move layout analytics](/crons/game-move-layout-analytics/).

## Privacy

- Authenticated users only (unauthenticated requests are rejected by the auth API).
- `userId` is embedded in `pk`; nightly S3 aggregates hash user ids for note correlation without raw subs in reports.
- Full note text is stored in private ops S3 for developer / ML review.

## Related

- [Database schema — layout feedback events](../database-schema.md)
- [Auth queries — `log_layout_feedback_event`](../api/auth-queries.md)
