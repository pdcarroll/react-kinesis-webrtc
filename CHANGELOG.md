# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2022-05-04

### Added

- (useMaster) Return param - `isOpen` - to indicate whether or not the underlying signaling client is open and ready to accept peers
- License file

### Changed

- Refactor: consolidated hooks in master & viewer
- Moved documentation from README to Wiki

## [0.1.1] - 2022-05-02

### Changed

- Fixes a bug that impacts sending a master local media stream to multiple remote peers simultaneously
- Delays initialization of peer connections until the local media stream is active (for two-way connections).
  This fixes bugs caused by a race between the local media stream and remote peer connection events, most
  visible when a user doesn't immediately grant access to the device's media
- Some cleanup in debug logging and variable names

## [0.1.0] - 2022-04-30

### Added

- (useViewer) Viewer-only mode to support one-way peer connections

### Changed

- (useViewer) Return errors from setting peer local description

## [0.0.5] - 2022-04-29

### Added

- Tests
- Option to view debug logs
- npm pack run script

### Changed

- Refactored peer management across hooks
