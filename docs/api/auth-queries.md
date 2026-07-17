# Auth queries

Handler: `module.exports.authQuery` — requires Cognito user JWT.

POST body: `{ "query": "<name>", "pars": { ... } }`

The authenticated user id is `cognitoPoolClaims.sub`.

## Profile and dashboard

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `me` | Dashboard payload: games, challenges, settings, bots, `blocked` list | `size` (`small` skips challenge fetch), `vars`, `update` |
| `next_game` | Next game id in user's list | — |
| `my_settings` | Minimal profile for settings UI | — |
| `new_setting` | Update name, language, country, bggid, about | `attribute`, `value` |
| `new_profile` | Bulk profile update | profile fields |
| `set_lastSeen` | Update last-seen timestamp | — |
| `toggle_star` | Favorite a metaGame | `metaGame` |

## Push, tags, palettes, customizations

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `set_push` | User push preference; `{ state: false }` removes **all** device subscriptions | `state` (boolean) |
| `save_push` | Register or refresh **this device** | `payload` (Web Push subscription object) |
| `delete_push` | Remove **this device** subscription | `endpoint` (subscription URL) |
| `save_tags` | Save game tags | `payload` (tag lists) |
| `save_palettes` | Save color palettes | `palettes` |
| `save_customization` | Per-game UI customization | `metaGame`, settings |
| `delete_customization` | Remove customization | `metaGame` |
| `update_standing` | SDG-style standing challenge preferences | `entries` |
| `update_user_settings` | User settings blob | settings fields |

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
| `standing_challenges` | Open challenges (filters blocked issuers) | `metaGame` |
| `submit_move` | Play a move | `metaGame`, `id`, `move`, … |
| `timeloss` | Report time loss | game ids |
| `abandoned` | Mark game abandoned | game ids |
| `invoke_pie` | Pie rule: reverse player order | game ids |
| `get_game` | Game with user context | `metaGame`, `id` |
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
| `get_playground` | Sandbox state | — |
| `new_playground` | Create sandbox | metaGame, variants |
| `reset_playground` | Clear sandbox | — |

## Tournaments

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `new_tournament` | Create automated tournament | tournament spec |
| `join_tournament` | Enter tournament | `id` |
| `withdraw_tournament` | Leave tournament | `id` |
| `start_tournament` | Start one tournament (organizer) | `id` |
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
| `event_update_invites` | Update invite list | `id`, invites |
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

| Query | Purpose | Key `pars` |
|-------|---------|------------|
| `update_meta_game_counts` | Recompute meta game counters | — |
| `onetime_fix` | One-off data repair | — |
| `fix_games` | Repair user game lists | varies |
| `delete_games` | Delete games (admin) | game ids |
| `test_push` | Send test push | — |
| `test_async` | Async test hook | varies |

## Related

- [API overview](/backend/api/overview/)
- [Public queries](/backend/api/public-queries/)
- [Subsystem docs](/backend/subsystems/challenges/)
