# Game Move layout analytics

Append-only usage events for the permanent four-layout play page (classic, strip, card, narrative). Events are written at request time and exported on demand via CLI — there is **no** nightly rollup cron.

Preview-era layout feedback (`LAYOUTFB#`, `log_layout_feedback_event`, `layout-feedback-analytics`) was removed in permanent-layouts Phase 3. S3 `gamemove-layout/analytics/` remains an archived snapshot only.

## APIs

### Auth (logged-in)

**Query:** `log_gamemove_layout_event`

Handler derives the partition key from `cognitoPoolClaims.sub`. The client sends a per-page-load `sessionId` (UUID) but never sends a partition key.

### Public (anonymous)

**Query:** `log_gamemove_layout_event`

Same payload shape. Anonymous rows are stored under `LAYOUTEVT#anon#<sessionId>`. The front enforces a **25 events / UTC day** client cap before calling; the server also rate-limits **25 / UTC day** per anonymous session partition.

```json
{
  "query": "log_gamemove_layout_event",
  "pars": {
    "event": "session_start",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "layout": "strip",
    "resolvedFrom": "default",
    "metaGame": "amazons",
    "storedLayout": "card",
    "viewportWidth": 1280
  }
}
```

### Event types

| Event | When | Extra `pars` |
|-------|------|----------------|
| `session_start` | Layout resolved on game page mount | — |
| `layout_switch` | User picks another layout in the switcher | `from`, `to` |

Common fields: `event`, `sessionId`, `layout`, `resolvedFrom`, `metaGame`. Optional: `storedLayout` (value in `gameMoveLayout` localStorage if any), `viewportWidth`.

### `layout` / `from` / `to` values

`classic` | `strip` | `card` | `narrative` (legacy `queue` normalizes to `card`).

### `resolvedFrom` values

`url` | `localStorage` | `default`

## DynamoDB storage

Single-table layout in `abstract-play-{stage}`:

| Actor | pk | sk |
|-------|----|----|
| Logged-in | `LAYOUTEVT#<userid>` | `<serverTsMs>#<random>` |
| Anonymous | `LAYOUTEVT#anon#<sessionId>` | `<serverTsMs>#<random>` |

Attributes: `event`, `sessionId`, `layout`, `resolvedFrom`, `metaGame`, `ts` (server ms), `isLoggedIn`, optional `storedLayout`, `viewportWidth`, `userHash` (logged-in only), `from` / `to` on switches.

- **No GSI** — export via CLI only.
- **No TTL** — purge or archive manually if volume grows.
- **Rate limits (UTC day):** 100 events per logged-in user (server); 25 per anonymous session (server + client cap).

Implementation: [`lib/layoutEvents.ts`](../../lib/layoutEvents.ts), wired from [`api/abstractplay.ts`](../../api/abstractplay.ts) (auth + public `query` handlers).

## CLI dump

```bash
node bin/dump-gamemove-layout-events.mjs --stage dev
node bin/dump-gamemove-layout-events.mjs --stage prod --from 2026-09-01 --to 2026-09-30 --out scratch/layout-events.jsonl
```

- Default: all time, JSONL to stdout.
- `--from` / `--to`: inclusive UTC calendar days on server `ts`.
- `--event session_start|layout_switch` optional filter.
- `--format json` for a single JSON array.

Pipe JSONL to an agent for layout share, switch matrices, viewport buckets, etc.

## Privacy

- Logged-in rows store `userHash` (SHA-256 of Cognito sub, truncated) for offline grouping; raw `userId` appears only in `pk` for rate limiting.
- Anonymous rows have no `userHash`; analysis is session-scoped.
- Rate-limit and validation errors are silent on the client (fire-and-forget).

## Related

- [Auth queries — `log_gamemove_layout_event`](/backend/api/auth-queries/)
- [Public queries — `log_gamemove_layout_event`](/backend/api/public-queries/)
- [Database schema — `LAYOUTEVT#`](/backend/database-schema/)
- [Front: Game move layouts](/front/subsystems/game-move/)
