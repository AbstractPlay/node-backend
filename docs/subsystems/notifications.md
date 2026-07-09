# Notifications

## Email (SES)

Transactional email is sent via AWS SES for:

- Challenge issued / revoked / accepted
- Game start and game end (with expanded end-game details)
- Tournament start and end

Users can disable most email categories in `settings.all.notifications`; push notifications for challenges are sent regardless.

Language follows the recipient's `language` field (`locales/*/apback.json`).

## Web push

VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) enable browser push. Subscriptions are stored on `PUSH` records. Queries: `set_push`, `save_push`, `test_push`.

## Your turn batching

The `yourturn` Lambda runs on a schedule (14:00 and 22:00 UTC, prod only) via EventBridge. It scans active games and sends batched "your turn" emails — not on every move.

Implementation: [`utils/yourturn.ts`](../../utils/yourturn.ts).

## Push topics

Push messages use topics such as `challenges` and game-related channels. See `sendPush()` usage in [`api/abstractplay.ts`](../../api/abstractplay.ts).

## Related

- [Getting started](/backend/getting-started/) — VAPID env vars
- [Deployment](/backend/deployment/)
- [Architecture](/backend/architecture/) — `yourturn` Lambda
