# Announcements

Site news replaces the weekly Discord export → `news.json` pipeline. **Abstract Play is the source of truth**; Discord `#announcements` is mirrored on first publish only.

Front plan: [announcements fan-out architecture](https://github.com/AbstractPlay/front) (living plan in maintainer docs). Phase 0 locked 2026-09-16.

## DynamoDB

Single-table keys (stage table `abstract-play-dev` / `abstract-play-prod`):

| Item | pk | sk | Notes |
|------|----|----|--------|
| Announcement | `ANNOUNCEMENT` | `<id>` | `id` = UUID for new posts; Discord import uses snowflake `message.id` |
| Published index (GSI) | `ANNOUNCEMENT_PUBLISHED` | `<publishedAt>#<id>` | List published, newest first; project metadata + `reactionCounts` |

**Announcement fields (core):**

- `status`: `draft` \| `scheduled` \| `published` \| `retracted`
- `title`, `body` (markdown), `attachmentKeys[]`
- `publishedAt` (ms), `createdAt`, `updatedAt`, optional `editedAt`
- `source`: `ap` \| `import-discord`
- `discordMessageId` (after webhook post)
- `reactionCounts`: `Record<emoji, number>` (denormalized)

**Reactions (minimal v1):**

- pk: `ANNOUNCEMENT`, sk: `REACTION#<emoji>#<userId>`
- Toggle via `announcement_react`; allowlisted emoji only
- No per-user notification rows on react

**User read cursor** (on `USER` settings, not a separate item):

- `settings.all.announcementsLastReadAt` (epoch ms)
- Unread = published items with `publishedAt` > cursor

## API queries

| Query | Auth | Role |
|-------|------|------|
| `announcements_list` | Public | Published only; pagination; includes `reactionCounts` |
| `announcement_get` | Public | By `id`; `attachmentUrls` for keys |
| `announcements_admin_list` | Admin | All statuses |
| `announcement_save` | Admin | Draft create/update; **edit published** (no fan-out) |
| `announcement_presign_upload` | Admin | Image upload for drafts/edits |
| `announcement_publish` | Admin | First-publish fan-out only |
| `announcements_mark_read` | Auth | Bump `announcementsLastReadAt` |
| `announcement_react` | Auth | Toggle allowlisted emoji |
| `announcement_reactions_mine` | Auth | `{ ids: string[] }` → user's emojis per id |

Register handlers in `api/abstractplay.ts` (or dedicated module) alongside feedback patterns.

## Unread and in-app bell (front)

- **No** Dynamo notification rows on publish (avoid N×users writes).
- Front merges **synthetic unread rows** in the navbar bell from `announcements_list` + server cursor.
- Hidden when `settings.all.inAppNotifications.announcements === false` (default **on**).

## Notification prefs

| Channel | Setting key | Default | When |
|---------|-------------|---------|------|
| In-app bell rows | `inAppNotifications.announcements` | on | Synthetic list only |
| Email | `notifications.announcements` (email map) | **off** | First `announcement_publish` only |
| Push | `notifications.announcements` (push map) | off | Optional later; first publish only |

Edits to published posts do **not** re-send email/push or reset unread cursor.

## Dev vs prod

| Stage | `announcement_save` / presign | `announcement_publish` |
|-------|------------------------------|------------------------|
| prod (`WEBSOCKET_STAGE=prod`) | Admin allowed | Admin allowed |
| dev (`WEBSOCKET_STAGE=dev`) | Admin allowed (draft/composer testing) | **403** `announcements_publish_disabled_on_dev` |

Front play.dev: disable Publish in admin UI (`VITE_REAL_MODE=development`). Ops import CLI is not gated.

## Publish vs edit

| Target | `announcement_publish` (first time) | `announcement_save` on published |
|--------|-----------------------------------|----------------------------------|
| Site list/get | Visible | Immediate update |
| Static `news.rss` | Regenerate + upload | Regenerate (same `<guid>`) |
| Discord webhook | POST once; store `discordMessageId` | **No** auto-update |
| Email / push | If pref on | **No** |
| Unread cursor | Users see new items | **No** re-notify |

**Retract:** `status: retracted`; hide from list/RSS; Discord follow-up manual or bot later.

### Discord webhook (v1)

Env: `ANNOUNCEMENTS_DISCORD_WEBHOOK_URL` (secrets manager per stage).

Example payload:

```json
{
  "content": "**{title}**\n{excerpt}\nhttps://play.abstractplay.com/news/{id}"
}
```

Excerpt = plain-text first ~200 chars of body. Full markdown and images live on site only.

## Attachments

- S3 prefix: `announcements/{announcementId}/…` (bucket TBD per stage; separate from feedback attachments).
- Markdown: `![alt](ap-att:{key})` in body; resolve to presigned GET on read.
- Import: `npm run import-discord-announcements` uploads from DiscordChatExporter `attachments[]` only (not avatars/reaction SVGs).

## Discord history import

- Canonical local export: `announcements.json` + sibling `announcements.json_Files`.
- **405** rows: non-empty `content` and/or message attachments; skip embed-only Builderman bot cards (58).
- **68** attachment files across **51** messages.
- Inline emojis: keep Unicode in `content`; rewrite `<:name:id>` tokens using `inlineEmojis[].name` when present.

## Reactions (site v1)

- Curated palette (~8); counts on list from `reactionCounts`.
- `announcement_reactions_mine` once per `/news` load for highlight state.
- Do not import Discord `reactions[]` from export.

## Related

- [Notifications](notifications.md) — email/push delivery
- [Public queries](/backend/api/public-queries/) — `announcements_list`, `announcement_get`
- [Auth queries](/backend/api/auth-queries/) — admin save/publish, mark_read, react
