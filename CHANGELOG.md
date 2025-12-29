# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.17] - 2025-12-29

### Fixed

- Improve webpack compiler error handling and add keep-alive workaround for Bun.

### Changed

- Update ESLint config to ignore `.yarn` directory.

## [1.0.16] - 2025-12-24

### Changed

- Update `@swc/core`, `inversify`, `lodash-es`, `webpack`, and ESLint/TypeScript-ESLint related dependencies to their
  latest versions.

## [1.0.15] - 2025-12-12

### Added

- Add multiple publish scripts for versioning and prepublish tasks.

### Changed

- Update dependencies and bump Yarn version.

## [1.0.14] - 2025-10-30

### Fixed

- Remove debug logging for command registration.

## [1.0.13] - 2025-10-30

### Fixed

- Enhance command registration logging with type and subcommand details.

## [1.0.12] - 2025-10-27

### Fixed

- Rename event listener from 'ready' to 'clientReady' in bot.

### Changed

- Update dependencies.

## [1.0.11] - 2025-10-14

### Added

- Integrate SWC for faster TypeScript compilation.

## [1.0.10] - 2025-04-21

### Fixed

- Remove 'clean' property from output config to prevent build errors.

### Refactored

- Modularize TypeScript config compilation in `config-loader`.

## [1.0.9] - 2025-04-20

### Fixed

- Ensure temporary build files survive output cleaning.

## [1.0.8] - 2025-04-20

### Refactored

- Improve `TerserPlugin` option handling in webpack config.

## [1.0.7] - 2025-04-20

### Changed

- Remove unused packages.

### Refactored

- Improve webpack config generation for clarity and flexibility.

## [1.0.6] - 2025-03-28

### Added

- Add support for multiple command handlers with the same identifier in interactions.

## [1.0.5] - 2025-03-22

### Refactored

- Replace `container.resolve` with `container.get` using autobind for controllers.

## [1.0.4] - 2025-03-20

### Changed

- Bump dependencies in `yarn.lock` for Babel, TypeScript-ESLint, ESLint, and InversifyJS.

### Refactored

- Update Inversify usage and guard resolution logic with autobind and streamlined imports.

## [1.0.3] - 2025-03-14

### Fixed

- Improve kebab-case normalization for app names in `createApp` method.

## [1.0.2] - 2025-03-14

### Added

- Add Node.js version check when creating a new MeoCord app.

### Changed

- Update `packageManager` to `yarn@4.7.0`.

### Fixed

- Normalize app name to kebab-case when creating a new MeoCord app.
- Enable corepack before installing dependencies.

### Documentation

- Update README with prerequisites and app creation guide.

## [1.0.1] - 2025-03-12

### Documentation

- Remove `verbatimModuleSyntax` setting from README.

## [1.0.0] - 2025-03-11

### Fixed

- Update regex to allow alphanumeric parameter names.
