# Notifications

## Email (SES)

Transactional email is sent via AWS SES for:

- Challenge issued / revoked / accepted
- Game start and game end (with expanded end-game details)
- Tournament start, end, and removal

Users can disable most email categories in `settings.all.notifications`; push notifications for challenges and tournaments follow the same preference flags where applicable (challenge/game push still sends regardless of email toggles for challenges).

Language follows the recipient's `language` field (`locales/*/apback.json`). At send time, if the user's language is not yet registered in i18next, notifications fall back to English while the stored preference is kept unchanged — adding a locale later will apply automatically for users who already selected that language.

## Web push

VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) enable browser push. Each device/browser subscription is stored as its own `PUSH` record (`sk: <userid>#<subscriptionKey>`). Auth queries:

- `save_push` — register or refresh **this device** (upserts one `PUSH` record; sets `mayPush` on the user)
- `delete_push` — unregister **this device** (`pars.endpoint`; clears `mayPush` when no subscriptions remain)
- `set_push({ state: false })` — unregister **all devices** for the user
- `set_push({ state: true })` — sets user preference only; still requires `save_push` to register a device
- `test_push` — send a test notification to all registered devices

When a push fails with HTTP 404 or 410 (stale endpoint), only that subscription record is deleted.

## Your turn batching

The `yourturn` Lambda runs on a schedule (14:00 and 22:00 UTC, prod only) via EventBridge. It scans active games and sends batched "your turn" emails — not on every move.

Implementation: [`utils/yourturn.ts`](../../utils/yourturn.ts).

## Push topics

Push messages use topics such as `challenges` and game-related channels. See `sendPush()` usage in [`api/abstractplay.ts`](../../api/abstractplay.ts).

## In-app dashboard feed

Per-user notifications stored under `NOTIFICATION#<userid>` and returned on `me_dashboard` (not on `me_profile`). Users dismiss items via `dismiss_notification` (`pars.sk`). The navbar uses `me_profile` only — notification TTL is **not** refreshed on profile fetches.

Users control which in-app categories are created via `settings.all.inAppNotifications` (separate from email/push `settings.all.notifications`). Toggles live in User Settings on the front end. Missing keys default to enabled (opt-out). `createNotification()` skips writes when a category is disabled; admin backfill uses `putNotificationItem()` and is not gated.

| Pref key | `body.type` values |
|----------|-------------------|
| `challenges` | `challengeIssued`, `challengeDeclined`, `challengeRevoked` |
| `gameStart` | `gameStart` |
| `gameEnd` | `gameEnd` |
| `ratingChange` | `ratingChange` (backend-crons daily batch) |
| `eventInvitation` | `eventInvitation` |
| `completedGameChat` | `completedGameChat` |

| `body.type` | When created | Front display |
|-------------|--------------|---------------|
| `challengeIssued` | Direct challenge opened | Game name links to `/games/{metaGame}`; **View** opens challenge response modal |
| `challengeDeclined` / `challengeRevoked` | Direct challenge response | Game name links to `/games/{metaGame}` |
| `gameStart` | Game begins | Game name links to `/move/{metaGame}/0/{gameId}` |
| `gameEnd` | Game ends | **View** links to `/move/{metaGame}/0/{gameId}` |
| `completedGameChat` | Post-game comment on completed game (`save_exploration` with `updateLastChat`) | **View** links to `/move/{metaGame}/1/{gameId}`; one active notification per game until dismissed; legacy backfill rows use generic message when `body.backfill` |
| `ratingChange` | Daily batch Glicko diff after summarize (backend-crons) | Game name links to `/ratings/{metaGame}`; variant labels in message when applicable |

### Batch `ratingChange` issuer (backend-crons)

Realtime Elo at game end was removed in Phase 4. `ratingChange` rows are now written by the `rating-change-notifications` Lambda in **backend-crons**, scheduled at **6:20 UTC** daily (after summarize at 6:00).

**Source data:** `_summary-ratings.json` on `records.abstractplay.com` — diffs conservative Glicko (`ratingLow`) per variant pool (`batchRatingGameLabel` keys in `highest[]`).

**Idempotency:** Prior run state in `_ratings-notification-snapshot.json` (same bucket). First deploy run seeds the snapshot only — **zero** notifications. Re-runs on the same `glickoMeta.generatedAt` are no-ops.

**Per-pool deduplication:** One notification per `(userId, gameLabel)` per run. Multiple rated games in the same pool between runs produce a single notification with the net `ratingLow` change.

**Anti-spam gates** (all must pass):

| Gate | Rule |
|------|------|
| Prior snapshot | First run seeds only |
| Human user | Skip `pk=BOT` IDs |
| Activity | `new.n > old.n` in snapshot |
| Magnitude | `|round(new.ratingLow) - round(old.ratingLow)| >= 5` (env `MIN_RATING_DELTA`) |
| Established enough | Skip provisional players with `n < minGamesProvisional` |

**DynamoDB item** (`NOTIFICATION#userId`): `body.type = ratingChange`, `metaGame`, `variants`, `gameId` empty (batch has no causal game), rounded `oldRating` / `newRating` on `ratingLow`, `oldRd` / `newRd`, `oldProvisional` / `newProvisional`, and `delta`.

Implementation: backend-crons `rating-change-notifications` Lambda (`src/functions/rating-change-notifications.ts`) and `src/lib/ratingChangeNotifications.ts`.

| `eventInvitation` | Organizer saves invite list on moderated event | `{organizerName} has invited you to the event` with event name linking to `/event/{eventId}` |

**Event invitations** apply only to human-moderated [organized events](/backend/subsystems/events/) (`ORGEVENT`) updated through `event_update_invites`. Each save notifies newly added invitees and any existing invitee who does not yet have an active `eventInvitation` for that event (for example, invited before this feature shipped). Re-saving an unchanged invite list does not duplicate notifications. Automated tournament sign-up does not use this path.

Implementation: [`lib/notifications.ts`](../../lib/notifications.ts), wired from [`api/abstractplay.ts`](../../api/abstractplay.ts).

### Admin read-only dump

`bin/dump-dashboard.mjs` assembles dashboard-shaped data from DynamoDB without Cognito or writes. Pass `--include-notifications` to add the `NOTIFICATION#` feed using `loadNotificationsForDashboard(..., { refreshExpiry: false })` so TTL is not tightened during inspection.

### Completed-game chat backfill (done)

One-time prod backfill (Aug 2026) created `completedGameChat` notifications for users with unread post-game chat before the Completed Games dashboard section was removed. The backfill script has been deleted; new post-game chat is enqueued from `save_exploration` only.

## Related

- [Getting started](/backend/getting-started/) — VAPID env vars
- [Deployment](/backend/deployment/)
- [Architecture](/backend/architecture/) — `yourturn` Lambda
