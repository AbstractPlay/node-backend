# Change log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

* Added `set_game_state` query that lets admin users replace game state. It only updates the state, not the envelope, so it needs to be an existing game of the correct type. So if you have a debug state from a broken Volcano game you want to test, you have to create a new Volcano game and then replace its state.
* When submitting a move for games with the flag `automove`, the backend will now check how many moves the next player has available. As long as there is only one choice, the backend will automatically make that move.
* Added generalized Pie rule function. When invoked, the list of players in the GAME record and each USER record gets reversed.
* (experimental) Added star functionality, including in updateMetaGameCounts.
* Adding `gameStarted`, `gameEnded`, and `lastChat` timestamps to `Game` interface.

### Changed

* "Your Turn" emails are now batched twice a day.
* "Game End" emails have been expanded with additional information.

## [1.0.0-beta] - 2023-04-30

Initial beta release.
