# meocord

## 4.0.0-beta.0

### Major Changes

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Build with [Rsbuild](https://rsbuild.rs) instead of webpack. Production builds are several times
  faster, and webpack and its four loader and plugin packages are no longer installed with MeoCord.
  The output is unchanged: `dist/main.js`, assets under `dist/assets/` with the same names, and the
  same source maps.

  **Breaking:** the `webpack` hook in `meocord.config.ts` is replaced by `rsbuild`, which receives
  Rsbuild's configuration. A config that still declares `webpack` stops the build with a message
  saying so. `MeoCordWebpackConfig` is removed; import `RsbuildConfig` from `meocord/interface`
  instead. The [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#2-replace-the-webpack-hook-with-rsbuild) shows where each
  webpack setting goes.

- [#19](https://github.com/l7aromeo/meocord/pull/19) [`204c7be`](https://github.com/l7aromeo/meocord/commit/204c7bec74886c931732cb771d9178b47fbec5e8) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Require dotenv 18. The `dotenv` peer dependency moves from `^17.4.2` to `^18.0.3`, so install
  `dotenv@18` alongside MeoCord 4. No application code changes — `import 'dotenv/config'` behaves
  the same. See the [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#1-upgrade-dotenv-to-18).

### Minor Changes

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `bundleDependencies`, which puts everything a bot needs inside `dist`, so it deploys without
  `node_modules` or an install step. Plain JavaScript dependencies are bundled into `main.js`. Native
  addons such as `sharp` are found while building and copied, with their platform binary, into
  `dist/node_modules` — nothing has to be listed.

  A build carrying native addons records its platform in `dist/meocord.platform.json`, and a bot
  started on another platform stops before going online with a message naming both. Build on the
  platform you deploy to. See
  [Self-contained builds](https://github.com/l7aromeo/meocord#self-contained-builds).

### Patch Changes

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Read `meocord.config.ts` on every build. `meocord build` read the compiled `dist/meocord.config.mjs`
  left by the previous build, so a config edit took effect one build late, and the watcher's reload
  on a config change reloaded nothing.

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Start the bot with `bun --no-install` from `meocord start`. Without it, bun downloads any package it
  cannot find while the bot runs, which a bot deployed without `node_modules` would do in
  production. If you start `dist/main.js` with bun yourself, pass the flag too.

- [#25](https://github.com/l7aromeo/meocord/pull/25) [`2179f85`](https://github.com/l7aromeo/meocord/commit/2179f85c2912d45e3fefbf996ca267c19a1a773c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Stop `meocord generate` overwriting files. Slash, context-menu and primary entry point controllers
  all wrote one shared `builders/sample.builder.ts`, so generating a second controller replaced a
  builder you had already edited. Each controller now gets its own `builders/<name>.builder.ts`
  exporting `<Name>CommandBuilder`, and registers a command named after it — `admin/ban` registers
  `admin-ban` — rather than every one registering `sample-slash`. Generating a controller, service or
  guard refuses if any file it would write already exists.

- [#24](https://github.com/l7aromeo/meocord/pull/24) [`5e2a54b`](https://github.com/l7aromeo/meocord/commit/5e2a54b67a1f9f51c4c3a3e8cf51247de2ac2528) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Type `deleted` on `createMockMessage()`. The mock tracks and documents it, but it was missing from
  the type, so `message.deleted` did not compile.

- [#24](https://github.com/l7aromeo/meocord/pull/24) [`5e2a54b`](https://github.com/l7aromeo/meocord/commit/5e2a54b67a1f9f51c4c3a3e8cf51247de2ac2528) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Accept slash command builders that add options. `@CommandBuilder(CommandType.SLASH)` rejected
  `new SlashCommandBuilder().addStringOption(...)`, whose type narrows to
  `SlashCommandOptionsOnlyBuilder`, so the most common builder — one command with an option — did
  not compile.

- [#21](https://github.com/l7aromeo/meocord/pull/21) [`bebf116`](https://github.com/l7aromeo/meocord/commit/bebf1168466595546017a317b62acd3707ff2d1c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Generate applications with current test tooling: vitest and `@vitest/coverage-istanbul` 5,
  `unplugin-swc` 2, and current eslint, prettier and typescript-eslint. A new application's
  `test:coverage` no longer fails on its decorated entry files.

## 3.2.2

### Patch Changes

- [#13](https://github.com/l7aromeo/meocord/pull/13) [`f8a6b15`](https://github.com/l7aromeo/meocord/commit/f8a6b156e8d22abf88443ba77c605d6d47991ab4) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Update the shipped dependencies — `@clack/prompts` 1.8.0, `@swc/core` 1.16.2, and `webpack`
  5.110.3 — and state the copyright as `2025-present`, including in the notice the CLI prints
  under `--license` and in its help banner.
