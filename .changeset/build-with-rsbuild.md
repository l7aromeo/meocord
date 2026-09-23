---
'meocord': major
---

pr: #22

Build with [Rsbuild](https://rsbuild.rs) instead of webpack. Production builds are several times
faster, and webpack and its four loader and plugin packages are no longer installed with MeoCord.
The output is unchanged: `dist/main.js`, assets under `dist/assets/` with the same names, and the
same source maps.

**Breaking:** the `webpack` hook in `meocord.config.ts` is replaced by `rsbuild`, which receives
Rsbuild's configuration. A config that still declares `webpack` stops the build with a message
saying so. `MeoCordWebpackConfig` is removed; import `RsbuildConfig` from `meocord/interface`
instead. The [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#2-replace-the-webpack-hook-with-rsbuild) shows where each
webpack setting goes.
