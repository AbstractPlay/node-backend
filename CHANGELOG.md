# Change log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Since the `1.0.0-beta` release, the version in `package.json` has stayed at `1.0.0-beta`. CI publishes tarballs as `1.0.0-ci-<GitHub Actions run id>.0` (see `.github/workflows/deploy-dev.js.yml` and `deploy-prod.js.yml`). Prod runs **two** Serverless stacks from this repo — API/WebSocket (`abstract-play`) then scheduled jobs (`abstract-play-backend-crons` under `crons/`). Entries below are grouped by theme and approximate ship window; the exact CI build is whichever workflow run last deployed the stage you use.

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
