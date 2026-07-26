# Changelog

All notable changes to PetDesk are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-26

### Added

- PetDesk standard action pattern v1 with nine action groups and 16 directions.
- Reusable custom-pet package documentation and runtime action metadata.
- Custom focus durations from 1 to 240 minutes.
- City-based current weather and four-day forecast powered by Open-Meteo.
- Weather and action-pattern unit tests.

### Changed

- Improved the control-center header, action lab, focus controls, weather layout, and responsive details.
- Made the tray left-click behavior context-aware.

### Fixed

- Replaced the one-way hide button with a visible status toggle that can restore the pet.
- Kept the tray menu label synchronized with the saved pet visibility state.
- Honored the `--hidden` launch argument for the control-center window.

## [0.1.1] - 2026-07-26

### Added

- Transparent, frameless, always-on-top desktop-pet window.
- Built-in cat, dog, rabbit, fox, and slime pet types.
- Idle, walking, blinking, stretching, playing, feeding, studying, sleeping, celebrating, and alert actions.
- Pet workshop with local pixel-art conversion and optional AI styles.
- Focus timer, Todo list, alarms, recurring reminders, habits, statistics, tray controls, and local persistence.
- Windows installer and portable build targets.
- English-only Windows launcher and builder scripts.

### Fixed

- Replaced Chinese launcher contents with ASCII-compatible commands to prevent Windows CMD encoding failures.

[Unreleased]: https://github.com/Wbestaaa/PetDesk/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Wbestaaa/PetDesk/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Wbestaaa/PetDesk/releases/tag/v0.1.1
