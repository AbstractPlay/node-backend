# Auth queries

Handler: `module.exports.authQuery` — requires Cognito user JWT.

POST body: `{ "query": "<name>", "pars": { ... } }`

The authenticated user id is `cognitoPoolClaims.sub`.

## Profile and dashboard

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `me_profile` | Site-wide profile for navbar, settings, and game renderer: settings, bots, tags, `activeGames` (`CURRENTGAMES#` keys only). No dashboard maintenance, challenges, or `lastSeen` writes. | — |
| `me_dashboard` | Dashboard tables: active `games`, `notifications`, challenges, timeout sweep. Clears `USER.cleaned` when set by abandoned-account cron. Does not refresh notification seen state. No `lastSeen` writes. | `vars`, `update` (legacy; reserved) |
| `next_game` | Next game id in user's list | — |
| `my_settings` | **Deprecated** — minimal id/name/email/language; use `me_profile` instead | — |
| `new_setting` | Update name, language, country, bggid, about | `attribute`, `value` |
| `new_profile` | Bulk profile update | profile fields |
| `set_lastSeen` | Update last-seen timestamp (active dashboard game or watched game) | `gameId`, optional `interval` |
| `dismiss_notification` | Remove an in-app dashboard notification (deleted from DynamoDB) | `sk` |
| `dismiss_all_notifications` | Remove all in-app notifications for the user | — |
| `list_notifications` | List in-app notifications for the navbar bell (does not mark seen) | — |
| `mark_notifications_seen` | Mark notifications as read (shortens TTL; retained until dismissed) | optional `sks` (array); omit to mark all **new** items |
| `toggle_star` | Favorite a metaGame | `metaGame` |

**`me_dashboard.notifications`:** array of `{ sk, createdAt, body, status }` items where `status` is `new` or `read` (see [Notifications — In-app dashboard feed](/backend/subsystems/notifications/)). Omitted from `me_profile`. Use `list_notifications` for navbar bootstrap and `mark_notifications_seen` when the user opens the bell panel.

## Watch, highlight, and representative games

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `watch_game` | Spectate a game (non-participant) | `metaGame`, `id` |
| `unwatch_game` | Stop spectating | `metaGame`, `id` |
| `highlight_game` | Pin a participated game on player page | `metaGame`, `id` |
| `unhighlight_game` | Remove highlight | `metaGame`, `id` |
| `recommend_game` | Recommend completed game for metaGame (max 2 per metaGame) | `metaGame`, `id` |
| `unrecommend_game` | Remove recommendation | `metaGame`, `id` |
| `log_recommendation_event` | Log game-recommendation impression event (show/click/challenge) | `event`, `batchId`, `surface`, `tier`, plus event-specific fields |
| `log_gamemove_layout_event` | Log Game Move layout usage event (`session_start`, `layout_switch`) | `event`, `sessionId`, `layout`, `resolvedFrom`, `metaGame`, plus event-specific fields |

See [Recommendations](/backend/subsystems/recommendations/) for recommendation event schemas and DynamoDB layout.

See [Game Move layout analytics](/backend/subsystems/game-move-layout-analytics/) for layout event schemas.

Mutations return the updated list (`watchedGames`, `highlights`, or `representatives`) on success.

## Feedback (bugs, ideas, wishlist)

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `feedback_presign_upload` | Presigned S3 PUT for bug screenshots | `filename`, `contentType`, `contentLength` (png/jpeg/webp, max 5 MB). Returns `{ uploadUrl, key, headers }`. |
| `feedback_create` | Create a post | `kind`, `title`, optional `body`, `gameUrl`, `attachmentKeys`, `context` (bugs). Bug screenshots optional (≤3 when provided). Returns `{ id }`. |
| `feedback_get` | Single post (auth adds `subscribed`, `userVoted`) | `id` |
| `feedback_vote` | Toggle vote | `id`, `vote` (boolean). Returns `{ voteCount, effectiveVotes, voted }`. |
| `feedback_comment` | Add comment | `id`, `body` and/or `attachmentKeys` (bugs/features only, ≤3 images), optional `subscribe` (default `true`). Allowed on terminal posts until archived. Returns `{ commentId }`. |
| `feedback_set_status` | Admin status change | `id`, `status`. Sets `terminalAt` when moving to a terminal status; removes it when reopening to a non-terminal status. Notifies author and subscribers. |
| `feedback_subscribe` | Watch/unwatch | `id`, `subscribe` (boolean). Returns `{ subscribed }`. |
| `feedback_reclassify` | Admin reclassify bug → feature | `id`. Open bugs become feature `open`; triaged bugs become `under_review`. Terminal bugs rejected. Returns `{ id, kind, status }`. |
| `feedback_update` | Edit title/body | `id`, optional `title`, `body` (at least one). Author or admin. Writes `EDIT#` audit rows. |
| `feedback_set_admin_fields` | Admin triage fields | `id`, optional `effort`, `priority`, `adminTags`, `wishlistCategory`, `wishlistCategoryNote`. |
| `feedback_mine` | List caller's posts | optional `kind`, `limit`, `cursor`. Returns `{ items, nextCursor? }`. |
| `feedback_admin_list` | Admin dashboard list | `kind`, optional `status`, `effort`, `priority`, `needsResponse`, `limit`, `cursor`. Returns `{ items, nextCursor? }` with `needsResponse` per item. |
| `feedback_delete` | Admin delete wishlist entry | `id`, `reason` (required). Permanently removes the post and notifies watchers. Wishlist only. Returns `{ id }`. |
| `feedback_merge` | Admin merge duplicate wishlist entries | `survivorId`, `duplicateId`. Moves comments/votes to survivor and deletes duplicate. |
| `feedback_hold_retention` | Admin retention hold (skip auto-archive) | `id`, `hold` (boolean). Returns `{ retentionHold }`. |

Data lives in DynamoDB table `abstract-play-feedback-{stage}` (not the main `abstract-play` table).

Nightly jobs: `utils/feedback-archive` Lambda (`npm run feedback-archive`) snapshots terminal posts to S3, writes `HISTORY#` rows, sets `archivedAt` and `expiresAt` TTL on live rows. `utils/feedback-attachment-cleanup` Lambda (`npm run feedback-attachment-cleanup`) deletes `{postId}/` screenshot objects after purge and sweeps stale `staging/` uploads; keeps `archive/{postId}.json` snapshots.

## Push, tags, customizations

Per-user board colours and preferred colour are configured via **Customize** (`save_customization` / `delete_customization`). Legacy named palettes (`save_palettes`, `settings.color`, `me_profile.palettes`) are retired.

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `set_push` | User push preference; `{ state: false }` removes **all** device subscriptions | `state` (boolean) |
| `set_public_rivalries` | Opt in to public rivalries table (both players must opt in for a pair to be named) | `state` (boolean) |
| `save_push` | Register or refresh **this device** | `payload` (Web Push subscription object) |
| `delete_push` | Remove **this device** subscription | `endpoint` (subscription URL) |
| `save_tags` | Save game tags | `payload` (tag lists) |
| `save_customization` | Per-game UI customization | `metaGame`, settings |
| `delete_customization` | Remove customization | `metaGame` |
| `update_standing` | SDG-style standing challenge preferences | `entries` |
| `update_user_settings` | User settings blob | `settings` (full object). Optional `settings.all.profile.avatar`: `{ style, seed }` — style must be one of the allowlisted DiceBear style ids; seed is 1–64 chars (`A–Z`, `a–z`, `0–9`, `_`, `-`). Invalid avatar returns **400**. When avatar is saved, `avatarStyle` / `avatarSeed` are mirrored on both the `USER` and public `USERS` records (the `user_names` query reads `USERS`); when avatar is removed or reset to default (key omitted), those mirror fields are removed from both. |

## Player blocking

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `block_player` | Block a player | `playerId` |
| `unblock_player` | Unblock a player | `playerId` |

See [Player blocking](/backend/subsystems/player-blocking/).

## Challenges and games

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `new_challenge` | Issue direct or standing challenge | `FullChallenge` fields |
| `challenge_revoke` | Cancel a challenge | `id`, `metaGame`, `standing`, `comment` |
| `challenge_response` | Accept or decline | `response`, `id`, `standing`, `metaGame`, `comment` |
| `start_solo_game` | Start a 1-player solo run (`rated: false`; optional `challengeSeed`, server assigns if omitted) | `metaGame`, optional `variants`, `challengeSeed`, clock fields |
| `standing_challenges` | Open challenges (filters blocked issuers) | `metaGame` |
| `all_standing_challenges` | All open standing challenges site-wide (filters blocked issuers) | — |
| `submit_move` | Play a move | `metaGame`, `id`, `move`, … |
| `timeloss` | Report time loss | game ids |
| `abandoned` | Mark game abandoned | game ids |
| `invoke_pie` | Pie rule: reverse player order | game ids |
| `get_game` | Game with user context and `watchCount` | `metaGame`, `id`, `cbit` |
| `update_game_settings` | Per-game settings | game + settings |
| `update_note` | User note on a game | `gameId`, note text |
| `update_commented` | Mark comments seen | game ids |
| `submit_comment` | Game chat message | `gameId`, comment |
| `set_game_state` | Admin: replace game state | game id, state (admin only) |
| `mark_published` | Publish exploration | exploration ids |

## Explorations and playground

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `save_exploration` | Save exploration branch | game + move tree |
| `get_exploration` | Load exploration | game, user, move |
| `get_private_exploration` | Private exploration | game, user, move |
| `list_playground_saves` | List user's playground saves (metadata only) | — |
| `get_playground_save` | Load one playground save | `id` |
| `create_playground_save` | Create playground save | `name`, `metaGame`, `date`, `body` |
| `save_playground_save` | Overwrite playground save | `id`, `name`, `metaGame`, `date`, `body` |
| `delete_playground_save` | Delete playground save | `id` |

## Tournaments

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `new_tournament` | Create automated tournament (meta game must support `playercount: 2`) | tournament spec |
| `join_tournament` | Enter tournament (same 2-player requirement) | `id` |
| `withdraw_tournament` | Leave tournament | `id` |
| `end_tournament` | End tournament | `id` |

## Organizer events

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `event_create` | Create event | event fields |
| `event_delete` | Delete event | `id` |
| `event_publish` | Publish event | `id` |
| `event_register` | Register player | `id` |
| `event_withdraw` | Withdraw player | `id` |
| `event_update_start` | Update start time | `id`, start |
| `event_update_name` | Rename event | `id`, name |
| `event_update_desc` | Update description | `id`, desc |
| `event_update_invites` | Update invite/block lists for a moderated event; newly added invitees receive an in-app `eventInvitation` notification | `eventid`, `invited`, `blocked` |
| `event_update_result` | Record result | `id`, result |
| `event_update_divisions` | Update divisions | `id`, divisions |
| `event_create_games` | Create linked games | `id` |
| `event_close` | Close event | `id` |

## Bots (owner)

| Query | Aliases | Purpose | Key `pars` |
|-------|---------|---------|------------|
| `create_bot` | `createBot` | Register a bot | name, endpoint URL, … |
| `update_bot` | `updateBot` | Update bot config | `clientId`, fields |
| `delete_bot` | `deleteBot` | Delete bot | `clientId` |
| `begin_bot_secret_rotation` | `beginBotSecretRotation` | Start secret rotation | `clientId` |
| `finalize_bot_secret_rotation` | `finalizeBotSecretRotation` | Complete rotation | `clientId`, secret |
| `ping_bot` | — | Health check bot endpoint | `clientId` |
| `test_bot_status` | — | Dev test bot status | — |
| `update_test_bot` | — | Dev test bot config | fields |

## Admin and maintenance

Post–Phase 5 the dashboard is **index-only** (`CURRENTGAMES#`, `USERGAME#`). Legacy `USER.games[]` and `RECENTCOMPLETED#` are retired.

### Still supported (authQuery)

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `update_meta_game_counts` | Recompute sharded `METAGAMES#<metaGame>/COUNTS` from live queries | — |
| `delete_games` | Hard-delete game records and all related dashboard / spectator / exploration rows | `metaGame`, `cbit` (`0` active / `1` completed), `gameids` (comma-separated) |
| `set_game_state` | Replace in-progress game state (`GAME` only; stream refreshes `CURRENTGAMES#`) | `id`, `metaGame`, `newState` |
| `test_push` | Send test push notification | — |
| `test_async` | Async test hook | varies |

`delete_games` removes, per game id:

- `GAME`, `NOTE`, `GAMECOMMENTS`, exploration branches
- `CURRENTGAMES#` / `USERGAME#` for human participants (stream projector also deletes legacy `RECENTCOMPLETED#` on game remove)
- `WATCHED#` / `GAMEWATCHERS#`, participant `HIGHLIGHT#`, `REPRESENTATIVE#` / `PLAYER#` recommendation rows
- Sharded meta counts (`currentgames` for active deletes; completed deletes rely on the stream projector for `completedgames` after `GAME` removal)

If `cbit` does not match the stored game, the handler tries the other completion bit automatically.

### Retired — returns `{ deprecated: true, useInstead: ... }`

Do **not** run these from the admin UI; use the replacement instead.

| Query | Replacement |
|-------|-------------|
| `me` | `me_profile` (site-wide bootstrap) and `me_dashboard` (`/me` page). `size: small` is not supported. |
| `fix_games` | `bin/verify-dashboard-index.mjs` then `bin/dashboard-index-maintenance.mjs --step purge-usergame-orphans --user-id <cognitoSub>` |
| `purge_retired_completed_games` | One-time purge complete (no retired rows remain) |
| `onetime_fix` | No replacement (legacy `USERS` directory sync) |

### Local scripts (not authQuery)

| Task | Command |
|------|---------|
| Dashboard health check | `node bin/verify-dashboard-index.mjs --stage prod [--verbose] <userId>…` |
| Purge legacy `RECENTCOMPLETED#` (if rows reappear) | `node bin/dashboard-index-maintenance.mjs --stage prod --step purge-all-recent-completed [--user-id <id>]` |
| Purge `USERGAME#` orphans | `node bin/dashboard-index-maintenance.mjs --stage prod --step purge-usergame-orphans [--user-id <id>]` |

```bash
# Example dashboard repair for one user
node bin/verify-dashboard-index.mjs --stage prod --verbose <cognitoSub>
node bin/dashboard-index-maintenance.mjs --stage prod --step purge-usergame-orphans --user-id <cognitoSub>
node bin/verify-dashboard-index.mjs --stage prod <cognitoSub>
```

## Related

- [API overview](/backend/api/overview/)
- [Public queries](/backend/api/public-queries/)
- [Subsystem docs](/backend/subsystems/challenges/)
