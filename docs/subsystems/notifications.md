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

Per-user notifications stored under `NOTIFICATION#<userid>` and returned on `me_dashboard` (not on `me_profile`). Users dismiss items via `dismiss_notification` (`pars.sk`).

| `body.type` | When created | Link / action data |
|-------------|--------------|-------------------|
| `challengeIssued` | Direct challenge opened | `challengeId` → challenge response modal |
| `challengeDeclined` / `challengeRevoked` | Direct challenge response | display only |
| `gameStart` / `gameEnd` / `ratingChange` | Game lifecycle | `metaGame`, `gameId` → `/move/{metaGame}/0/{gameId}` |
| `eventInvitation` | Organizer adds invitees on moderated event | `eventId`, `eventName`, `organizerId`, `organizerName` → `/event/{eventId}` |

**Event invitations** apply only to human-moderated [organized events](/backend/subsystems/events/) (`ORGEVENT`) updated through `event_update_invites`. Each save notifies newly added invitees and any existing invitee who does not yet have an active `eventInvitation` for that event (for example, invited before this feature shipped). Re-saving an unchanged invite list does not duplicate notifications. Automated tournament sign-up does not use this path.

Implementation: [`lib/notifications.ts`](../../lib/notifications.ts), wired from [`api/abstractplay.ts`](../../api/abstractplay.ts).

## Related

- [Getting started](/backend/getting-started/) — VAPID env vars
- [Deployment](/backend/deployment/)
- [Architecture](/backend/architecture/) — `yourturn` Lambda
