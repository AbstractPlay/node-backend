# Change log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Since the `1.0.0-beta` release, the version in `package.json` has stayed at `1.0.0-beta`. CI publishes tarballs as `1.0.0-ci-<GitHub Actions run id>.0` (see `.github/workflows/deploy-dev.js.yml` and `deploy-prod.js.yml`). Prod runs **two** Serverless stacks from this repo — API/WebSocket (`abstract-play`) then scheduled jobs (`abstract-play-backend-crons` under `crons/`). Entries below are grouped by theme and approximate ship window; the exact CI build is whichever workflow run last deployed the stage you use.

## [1.0.0-ci] - 2026-10-29

### Added

- **Realtime Arena:** Live unrated two-player Fischer games (`playMode: 'arena'`, ms `arenaClock`, catalog `arenaTcId`) via `submit_arena_move` and EventBridge Scheduler timeloss; open or invite-only closed tables (no matchmaking queue). Public `list_arena_time_controls` and `list_arena_tables`; auth lobby (`ARENATABLE`, table chat, variants on create); synchronized start and `arena_sync` WebSocket; post-game soak `submit_arena_feedback` (`ARENAFB#`); ops scripts and CloudWatch `AbstractPlay/Arena` metrics; `records` stamps arena fields on completed JSON. Docs [Realtime Arena](/backend/subsystems/arena/).
- **Continuous Delta Ladder:** Player-created correspondence ladders (kernel, pool, challenges, hub chat, `watchLadders`); `ladderJoin` / `ladderLeave` / `ladderPointsChange` / `ladderChat` / `ladderDecay` in-app notifications; daily crons `ladder-decay` and `ladder-reconcile-counts` (ops S3 `ladders/reconcile/*`); `records` `event/{ladderId}.json`; ops `scripts/reconcile-ladder-active-counts.ts`, `backfill-ladder-by-user`, `replay-ladder-member`; docs [subsystems/ladders](/backend/subsystems/ladders/). Enable prod UI by removing `VITE_LADDER_UI_DISABLED` on the front deploy.
- **Ladders:** `npm run backfill-ladder-join-seeds` — recompute join `startingPoints` from `_summary-ratings` after lookup key fix.

### Changed

- **Ops:** Durable CLI tooling moved from `bin/` to `scripts/`; `bin/` is gitignored local scratch (calibration JSON, experiments).
- **Ops:** `.gitattributes` no longer uses `merge=ours` on root `package.json` (avoids stale npm `scripts` after develop→main); pin manifests unchanged.
- **Ops:** Game projector SQS DLQ and DLQ CloudWatch alarm deploy on **prod** only (dev stack no longer creates `abstractplay-game-projector-dlq-dev`).
- **Ladders:** `displayName` uses gameslib `expandVariantLabels` (same variant copy as the front ladder hub), e.g. `Exxit ladder (…)` instead of `(no variants)` or raw UIDs.
- **Game links:** `playMode: 'arena'` on completed/current open-API game summaries, player mark summaries, and arena game-end (and start) in-app notifications so the front can link to `/arena/play` without relying on `/move` redirects.
- **Arena:** Auth query `get_my_arena_table` (`ARENAUSER`) for the landing UI one-table-per-player guard.

### Fixed

- **Ladders:** Join seed lookup uses meta-game UID and `variantUidsForBatchRating` (same keys as summarize / Glicko), not display titles or raw empty variant lists on games with variant groups.
- **WebSockets:** `messageHandler` delivers `arena_launch`, `arena_sync`, and `ladder` verbs (were dropped as unsupported after arena/ladder fan-out shipped).
- **Recent completed games:** finished arena games are written to the global `COMPLETEDGAMES` index (`recent_completed_games` / `/recent-games`); the stream projector still skips arena for `CURRENTGAMES` dashboard rows. Ops: `npm run backfill-arena-completed-index -- --stage dev|prod [--metaGame uid] [--dry-run|--apply]`.
- **Arena:** `invoke_pie` on live arena games no longer applies correspondence `clockInc`/`clockMax` hour fields (which zeroed Fischer banks); arena pie debits think time and adds Fischer increment on the **invoker** only, keeps opponent banks unchanged, keeps each player’s ms bank on their record through seat swap, reschedules timeloss, and broadcasts like `submit_arena_move`.

## [1.0.0-ci] - 2026-10-24

### Fixed

- **Tournaments:** `get_tournament` with `isArchived=true` falls back to the active `TOURNAMENT` row when the series is not archived yet (fixes `/tournament/{metaGame}/{id}` for ongoing events).
- **Tournaments:** `get_tournament` loads archived rows with one `COMPLETEDTOURNAMENT` Get when `metaGame` is set (`/tournament/{metaGame}/{id}`); no catalog-wide BatchGet fallback.
- **Tournaments:** `get_old_tournaments` includes the most recently completed round for a series while it remains on `TOURNAMENT` (before `archive_tournaments` moves it to `COMPLETEDTOURNAMENT`), so game history pages list the latest finished event.
- **Crons:** `records-cooccur` attaches the gameslib Lambda layer so `shouldPublishStats` resolves at runtime (was missing after retracted-meta filtering).
- **Games:** `hydrateGameState` repairs legacy Guerrilla Checkers match stack rows (combined G1→G2 transition) via gameslib `repairGuerrillaMatchStackJson`.
- **Tournaments:** clock timeouts (`timeloss`) now run the same post-game tournament updates as `submit_move`, including `endTournament` when a division finishes (fixes events stuck at 100% games with no `dateEnded`).
- **Tournaments:** `starttournaments` reuses existing leg-1 pairing games on every start attempt (not only admin resume), preventing duplicate games after a partial failed start.
- **Tournaments:** division finalization runs when `numCompleted >= numGames` (covers extra pairing rows from legacy duplicate games).

### Added

- **Ops:** `npm run backfill-guerrilla-match-stack` repairs affected `GAME` rows in DynamoDB (`--dry-run` / `--apply`).
- **Ops:** `npm run unblock-stuck-tournaments` calls `endTournament` for known stuck prod tournaments (`--live`, optional `--id`).
- **Ops:** `npm run repair-tournament-duplicate-pairing` removes a duplicate `TOURNAMENTGAME`, recalculates `TOURNAMENTPLAYER` scores, and sets `numCompleted` (`--live`).

## [1.0.0-ci] - 2026-10-20

### Fixed

- **Challenges:** teaching-mode issue validation skips empty `challengees` entries (open standing payloads with `[""]` no longer fail `isBotId` lookup).
- **Challenges:** invalidate in-memory `all_standing_challenges` cache when a new open challenge is issued so site-wide lists include it immediately.
- **Completed games index:** stream projector deletes the previous `lastMoveTime#id` completed-dashboard rows when `lastMoveTime` changes on a completed `GAME` modify; `bin/dedupe-completed-game-indexes.mjs` removes existing duplicate index rows and fixes sharded `completedgames` counts.
- **Completed games list:** `sanitizeInGameCommentedFlags` dedupes `GAMECOMMENTS` BatchGet keys when `COMPLETEDGAMES#<metaGame>` contains duplicate rows for the same game id (fixes 500 on Storisende completed tab).
- **Games:** `hydrateGameState` infers variant uids from the engine when both the GAME `variants` attribute and state JSON are empty (Amazons already patched state from GAME `variants` only; Generatorb needed engine inference).

### Added

- **Ops:** `npm run backfill-orb-game-variants` repairs Generatorb `GAME` rows whose `variants` and serialized state lost `noglobes` (requires gameslib with opening-board inference).
- **Thumbnails:** CDN `{uid}.json` is a v1 envelope with `source` (sampled game id, cbit, move URL) and `render` (board JSON); `sqs-to-render` unwraps `render` for SVG generation. Legacy bare render JSON remains readable until the next daily thumbnail run.
- **Thumbnails:** composite `render()` output (`kind: "composite"`) is labeled per panel and rasterized via `renderComposite` in `sqs-to-render` (not coerced to a single frame).
- **Bots:** `botQuery` verb `pie` for registered bots (seat swap on the bot's turn; same checks as `move`, delegates to `invokePie`). Documented in [Bot protocol](/backend/bots/protocol/) and [Bot queries](/backend/api/bot-queries/).
- **Bots:** owner diagnostics — failed `move`/`pie` after turn validation notifies the bot owner (`botMoveFailed`) and posts a system in-game chat message (deduped); new `pingOwner` verb for bot-reported internal errors (`botOwnerPing`, rate-limited). In-app category `bots`.
- **Records (crons):** optional merge of legacy AiAi player id `SkQfHAjeDxs8eeEnScuYA` into prod registered bot client id via `AIAI_BOT_RECORDS_CANONICAL_ID` (prod deploy sets from `AIAI_BOT_ID_PROD`); drops stale `player/{legacy}.json` shard when canonical is set.
- **Teaching mode:** optional `teachingMode` on `new_challenge` / standing challenges (2-player, non-simultaneous only); server forces `rated: false` and copies the flag onto started games. Auth queries `teaching_grant_undo`, `teaching_keep_move`, and `teaching_undo_move`; `submit_move` blocked during review; `invoke_pie` disabled. Documented under [Challenges](/backend/subsystems/challenges/) and [Games and moves](/backend/subsystems/games-and-moves/). Front: challenge modals and move-page grant/keep/undo UI; pie rule hidden on teaching games.
- **Challenges:** direct 2-player `startPosition: { state }` on `new_challenge` (forces teaching mode, `CHALLENGEPOSITION` storage, game starts from preset); auth `get_challenge_position_preview` for participants before accept. Front: issue from Playground or live move tree (“Teach this position”), challenge modal with locked teaching mode, board preview on accept.
- **Challenges:** open (standing) 2-player `startPosition` on `new_challenge`; `get_challenge_position_preview` requires `metaGame`, open to signed-in acceptors; `CHALLENGEPOSITION` retained for indefinite standing (`duration: 0`) across repeated games; deleted with challenge row on revoke, cron cleanup, and final `duration: 1` acceptance. Front: open-challenge accept modal with board preview; issue from position allows Open vs Closed (default Closed).
- **Feedback:** `feedback_presign_upload` accepts SVG (`image/svg+xml`) and Markdown (`text/markdown`) attachments.
- **Vacation mode:** correspondence clock pause (14×24h UTC quota per year) with `schedule_vacation`, `update_vacation`, and `stop_vacation` auth queries; server-side elapsed time via `lib/clockElapsed.ts` / `lib/vacation/` on timeout, moves, timeloss, and dashboard urgency; `vacation` snapshot on `me_profile` / `me_dashboard` and display seeds (`clockDisplayServerTime`, `effectiveRemainingMs`, `clockPaused`, per-player `onVacation` / `vacationScheduled`) on dashboard games and `get_game`; public `user_names` **`onVacation`** mirror and **`player_about.vacation`** detail; front **User Settings → Vacation** tab and **On vacation** badges on players list, challenge pickers, and profiles. See [Vacation mode](/backend/subsystems/vacation/).
- **Ops:** `ap:service` and `ap:stage` cost-allocation tags on the `abstract-play` and `abstract-play-backend-crons` Serverless stacks (Lambdas, DynamoDB, S3, SQS, SNS).
- **Notifications:** WebSocket `notification` verb after in-app items are created (`createNotification`); user-targeted delivery via `lib/wsMessageDelivery.ts`.
- **Tournaments:** richer tournament-end email (division winner, standings, tournament link, next-series signup nudge); shorter tournament-end push (winner + nudge). Division standings logic extracted to `lib/tournaments/divisionStandings.ts` with prod-sampled regression fixtures and `npm run verify-division-standings`.
- **Tournaments:** `TOURNAMENTBYUSER#` sparse index for dashboard current tournaments; `me_dashboard.currentTournaments`; ops scripts `npm run backfill-tournament-by-user` and `npm run reconcile-tournament-by-user`.
- **Tournaments:** tournament-level chat (`TOURNAMENTCOMMENTS`, public `get_tournament` `comments`, auth `submit_tournament_comment`); in-app `tournamentChat` notifications (pref `tournamentChat`); WebSocket `watchTournaments` and `tournament` verb for live refresh on the tournament page.

### Removed

- **AiAi (embedded bot):** legacy public `bot_move` query, `AIAI_USERID` / `abstractplay-aiai-*` SQS env, embedded challenge auto-accept (`botManageChallenges`), and `realPingBot` SQS path. Turn notifications use registered bots only (`BOT_OUTBOUND_QUEUE_URL`). Legacy user `SkQfHAjeDxs8eeEnScuYA` is omitted from `user_names`; records alias via `AIAI_BOT_RECORDS_CANONICAL_ID` unchanged.

### Changed

- **Tournaments:** automated tournament games now start each player at the full `clockMax` bank (leg 2 uses the same cap); shared constants in `lib/tournaments/clock.ts`.
- **CI deps:** cross-branch merges keep target-branch `package.json` / lockfile via `.gitattributes` (`merge=ours`); dep relay auto-commit stages root manifests and `crons/package.json`; `postinstall` syncs crons AP pins from root.
- **CI deps:** `npm run setup-git` registers the `merge.ours` driver (`.gitattributes` alone did not prevent develop↔`main` conflicts); documented GitHub PR merge limitation.
- **Dashboard:** `me_dashboard` no longer queries or returns in-app notifications (use `list_notifications` only).

### Fixed

- **`user_names`:** omit humans without a registered display name (incomplete `new_profile` / phantom `USERS` rows); direct `new_challenge` rejects unregistered human opponents; presence `lastSeen` touches no longer create nameless `USERS` rows.
- **Thumbnails:** daily cron skips per-meta render/upload failures and logs a structured `THUMBNAIL_GENERATION_REPORT` (meta, game id/sk, phase) so one bad sample does not fail the whole batch.
- **Tournaments:** `endTournament` now awaits pending DynamoDB, email, and notification work.
- **Challenges:** repair legacy standing-challenge `challengees` corruption on accept/leave; correct 3+ player fixed seating on game start; `bin/backfill-standing-challenge-challengees.mjs` for one-time DynamoDB cleanup.
- **CI deps sync:** develop/prod deploy auto-commit stages `ci-deps.*.json`, `package-lock.json`, and root `package.json` together (space-separated `file_pattern`; no separate `crons/package.json` commit).
- **CI deps / crons workspace:** deploy and PR Test workflows align `crons/package.json` AP pins before `npm ci`; relay auto-commit includes `crons/package.json`; `check-crons-ap-pins` in lint; `npm run ci:install` for local clean installs after merges.

## [1.0.0-ci] - 2026-09-30

### Added

- **Game retraction:** catalog handling when meta-games are retracted (see crons retraction registry); omit from records output without deleting live `GAME` rows.
- **Tournaments:** two-leg automated tournament pairings.
- **Feedback:** feature tagging on items; `.txt` and `.json` attachments; technical context on bug reports.

### Changed

- **Exploration and thumbnails:** hardened public exploration processing and thumbnail generation paths.
- **Chat:** more reliable `lastChat` / new-chat signalling on completed games.
- **Challenges:** defense in depth against accepting your own challenge; improved 3+ player standing-challenge handling; no duplicate players invariant on join paths.
- **Tournaments:** duplicate-detection fix when starting events.

### Fixed

- Node 24 Lambda init failures; esbuild alias issues in bundled handlers.
- Concurrency edge cases around announcements and related writes.

## [1.0.0-ci] - 2026-09-28

### Added

- **Monolith split:** RPC handlers reorganized under `api/routes/` and `lib/` (replacing the single large module layout); **`set_game_state`** admin query to replace engine state on an existing game of the correct type (envelope unchanged).
- **Announcements:** paginated in-app announcements, admin CRUD, email fanout, and read/unread markers.
- **Feedback (in-app):** multi-phase bug/feature workflow — validation, priorities, autovote, archive, reviewer assignment, cover images on wishlist entries, Discord and BGG wishlist import tooling, comments on closed items, reclassification bug ↔ feature.
- **Crons:** [backend-crons](https://github.com/AbstractPlay/backend-crons) merged back into `crons/`; deploy remains a two-stack flow (API then crons).
- Opt out of **direct challenges**; duplicate display-name checks.
- Consolidated **completed games** and **open challenges** list queries for the dashboard.

### Changed

- **Serverless Framework 4** on prod; centralized AP dependency install via `ci-deps.*.json` and `bin/install-ap-deps.mjs`.
- **i18n:** automated Weblate merge scripts, locale pruning, CI auto-translate for English source; translatable game names in backend copy.
- More efficient announcement emails; notification read auto-expiry extended to 30 days; **dismiss all** / retain seen notifications.

## [1.0.0-ci] - 2026-08-30

### Added

- **DynamoDB normalization (complete):** phased cutover — stream projector, retired redundant `COMPLETEDGAMES` overlays, top-level **`gameStarted`** / **`gameEnded`**, **`watchCount`** on games, maintenance/backfill scripts documented under deployment.
- **In-app notifications:** preferences, rating-change notices, new-chat alerts, tournament start/end (respecting user prefs; no push for solo games), opponent id on game-end payloads; string scores supported.
- **Social / discovery:** player **blocking**; **watch**, **highlight**, and **recommend** on games; recommendation **impression** logging; **rivalries** setting; **layout analytics** pipeline (move-layout feedback); experimental variant filtering.
- **Feedback** groundwork and **game-move layout** subsystem docs; ops alert email on failures.
- **Profile:** DiceBear avatars; **About** expanded to 1k characters; **`preferredColour`**; account-bound **solo playground** saves.
- **Push:** multidevice registrations with per-device deletion; web-push subject fixes by stage.
- **WebSocket:** live **game watching** and efficiency improvements (connection metadata off `me()` payload).
- **Solo games** end-to-end support with tournament guards.
- **i18n:** Esperanto and `es-US` in managed set; locale sidecars for translation tracking.

### Changed

- **Ratings:** removed expensive real-time rating math from hot `me()` paths; front-end uses precomputed counts; Glicko-related tournament start fixes.
- **Full ESM** package (`"type": "module"`) with Lambda bundle smoke tests in CI.
- **Dynamic flags** on gameslib titles drive backend behaviour without hard-coded lists.
- Self-heal deprecated user settings; stop persisting redundant palette blobs on `USERS`.
- Variant **constraints** on challenges; **`expandVariants`** canonicalization.

### Fixed

- Completed-games dashboard under normalized keys; websocket subscribe permissions; nanoid/Lambda compatibility.

## [1.0.0-ci] - 2026-06-30

### Added

- **Bots:** separate dev/prod Cognito M2M pools, OAuth scopes, **secret rotation**, documented **test bot**, `botQuery` ↔ `authQuery` integration hardening.
- **Org events:** `maxPlayers`, invites, and player blocks on organized events.
- **Customizations:** `save_customizations` / `delete_customization` with typed storage.
- Admin **`fixGames`** maintenance query.
- Clock **time increments** applied when moves are auto-played (forced moves and premoves).

### Changed

- Expanded copy when the **pie** rule is invoked.
- Standing challenges: always resolve meta before variant when issuing.
- Most scheduled jobs except **`yourturn`** live in the **crons** stack; Node **24** runtime rollout and initial `docs/` architecture pass.

## [1.0.0-ci] - 2025-12-31

### Added

- **WebSocket** API: `$connect` / `$disconnect`, authenticated **subscribe**, SQS-backed **`messageHandler`** broadcasting on moves and comments; visible vs invisible presence on connections.
- **Premove** queueing and cleanup on move application.
- **POST `/query`** (and auth paths) for large request bodies (e.g. verbose error reports).

### Changed

- **ESM** migration for Lambda handlers and dependencies.
- Heavy batch jobs (**records**, **summarize**, **thumbnails**, **dumpdb**) moved to the standalone **backend-crons** repo (later re-home under `crons/`).
- Game state hydration via **`GameFactory`** (compressed representations).
- Game lists: **comments** column; challenge details promoted to top-level attributes; **`sendCommandWithRetry`** for throttled DynamoDB writes.
- Meta-game **counts** verification when new titles appear; tournament **score** fixes and randomized start order.
- Stale **push** subscription cleanup.

### Fixed

- CORS headers including credentials on API responses; VAPID subject per stage.

## [1.0.0-ci] - 2025-06-30

### Added

- **Standing challenges** revival: one active challenge per definition, `dateIssued`, stable id field, stricter typing.
- **`autopass`** for titles with the autopass flag (only move when pass is sole legal action).
- **Move-times** analytics pipeline (player timing scores, opponent h-index in summarize); summarize **hotness** timeframe tweaks.
- Tournament **start/end emails** gated on user preferences with deep links.

### Changed

- Lambda runtime bump (Node 20 era); daily stats generation experiments.

## [1.0.0-ci] - 2024-12-31

### Added

- **Organized events:** divisions, organizer flag on **`me()`**, winners as player id arrays; records capture event summaries and completed tournaments.
- **Hidden information** stripped from `game` / `submitMove` responses for spectators and non-seat players.
- **Records pipeline** split into smaller Lambdas; **time-to-move** extraction; timeout **histograms** in summarize.
- Profile **`bggid`** and **`about`** via settings; typed **`MeData`** return shape.
- **`next_game`** auth query to refresh an empty My Turn queue.

### Changed

- **Your Turn** emails: urgent-notice line; batched cron fixes after switching scan source off legacy indexes.
- **Tournaments** start twice daily; resign/timeout paths call **`applyMove`** when the engine is not yet terminal.
- Chat **`lastSeen`** always updated; supports in-game “new chat” detection on active games.

## [1.0.0-ci] - 2024-06-30

### Added

- **Bots in production:** webhook ping after moves and pie; **Furl** / AiAi scaffolding; variant-aware **MGL** selection; bots may **resign**; bots invoke **pie**; tournament auto-registration for next event.
- **Tournaments:** four players to start, auto-join next round, admin **`startATournament`** / **`endATournament`**, **`checkForTimeloss`**, **`checkForAbandonedGame`**, initial rotation fix.
- **Challenge comments** on standing challenges; **`noExplore`** on games/challenges.
- **`reportProblem`** admin helper.

### Changed

- **Automove** vs pie-even interaction fixes; standing-challenge duration race guard.
- Summarize: weekly player counts; ignore abandoned games in hours-per-move stats.
- Dev CI pulls pinned **gameslib** build; Serverless Framework 3 pin in workflows.

## [1.0.0-ci] - 2023-12-31

### Added

- **Records site** generation, S3 manifest, scheduled **summarize** Lambda (variant tabs, **`pied`** breakdown, DB export trigger).
- **Push notifications** (VAPID, **`mayPush`** setting, integrated at move/chat/game-end points).
- **Ratings and stats:** Glicko-2 and TrueSkill in records; **h-index**; **geostats**; draws counted as half a first-player win in meta stats; activity histograms and hours-per-move.
- **`USERS`** table maintenance (country, **`lastSeen`**, stars); **tags** on games; saved **player palettes**.
- **Public exploration** trees and per-player **notes** on games.
- **Standing challenge duration** (accept limit before expiry).
- **Solo playground** auth path.
- Generalized **pie** rule (player order reversal); **`automove`** when exactly one legal move; experimental **stars** on games and in **`me()`**.
- **`gameStarted`**, **`gameEnded`**, and **`lastChat`** on game records; richer **game over** emails.
- **`setLastSeen`**; completed-games list payload for the new UI page.
- Variants on current/completed game list projections.

### Changed

- **Your Turn** emails batched twice daily (cron in **`yourturn`**, 14:00 and 22:00 UTC prod) instead of per-move email.
- **GAMES** partition re-keyed for per-metaGame queries; optimistic locking on player game lists; migration away from **`CURRENTGAMES`** duplicates.
- Lambda **Node 18**; function versioning disabled to avoid code-size limits.
- Simultaneous games: respect eliminated seats in **`applySimultaneousMove`**.

### Fixed

- **`rotate90`** direction (counter-clockwise); exploration/versioning bugs; notes lifecycle when games end.

## [1.0.0-beta] - 2023-04-30

Initial beta release.
