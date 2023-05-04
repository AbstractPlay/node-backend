# Change log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

* Added `set_game_state` query that lets admin users replace game state. It only updates the state, not the envelope, so it needs to be an existing game of the correct type. So if you have a debug state from a broken Volcano game you want to test, you have to create a new Volcano game and then replace its state.

### Changed

* Disabled "Your Turn" email notifications for now.

## [1.0.0-beta] - 2023-04-30

Initial beta release.
