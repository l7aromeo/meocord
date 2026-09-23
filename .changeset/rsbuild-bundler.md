---
'meocord': major
---

Build with Rsbuild instead of webpack.

`meocord build` and `meocord start --dev` now run on [Rsbuild](https://rsbuild.rs). Builds are
several times faster — a production bot that took 1.3–2.2s under webpack builds in about 0.5s —
and webpack, swc-loader, terser-webpack-plugin, tsconfig-paths-webpack-plugin and
webpack-node-externals are no longer installed with MeoCord.

The output is file-for-file what webpack produced: the same `dist/main.js` entry, assets under
`dist/assets/` with the same names, asset imports that resolve to absolute paths on disk, and
the same source maps.

**Breaking: the `webpack` hook is now `rsbuild`.** A `meocord.config.ts` that still declares
`webpack` stops the build with a message saying so, rather than building with the hook silently
ignored. To migrate, rename the hook and reshape its body:

```ts
// before
webpack: config => {
  config.module.rules?.push({ test: /\.md$/i, type: 'asset/source' })
  config.module.rules?.push({ test: /\.(png|webp|svg|ttf)$/i, type: 'asset/resource' })
  return config
},

// after
rsbuild: config => {
  config.tools ??= {}
  config.tools.rspack = (_rspackConfig, { addRules }) => {
    addRules([{ test: /\.md$/i, type: 'asset/source' }])
  }
  return config
},
```

- Rules for images, fonts, svg and media can simply be deleted — Rsbuild emits them itself.
- A custom asset filename, including a function, moves to `output.filename.image` (and `svg`,
  `font`, `media`).
- `devtool` becomes `output.sourceMap.js`.
- Anything else goes through `tools.rspack`, which takes a webpack-shaped config.
- The `MeoCordWebpackConfig` type is removed; the hook is typed with Rsbuild's `RsbuildConfig`.

**New: `bundleDependencies` and `externals`.** Set `bundleDependencies: true` to put production
dependencies inside `dist`, so the bot runs without `node_modules`. Native addons such as `sharp`
cannot be bundled — list them in `externals` and install them on the server. `meocord build`
detects a bundled native addon and fails, naming the packages to add, because such a build would
otherwise run on the machine that built it and fail in production the first time the addon loads.
discord.js's optional accelerators — `zlib-sync`, `bufferutil`, `utf-8-validate` — are left out of
the bundle automatically.

**Fixed: builds used the previous build's config.** `meocord build` read the compiled
`dist/meocord.config.mjs` left by the last build rather than `meocord.config.ts`, so an edit took
effect one build late, and the watcher's reload on a config change reloaded nothing. Builds now
always read the source.

**Changed: bun no longer installs packages at runtime.** `meocord start` launches the bot with
`bun --no-install`. Without it, a bot deployed with no `node_modules` would fetch any missing
import from the registry while running. If you launch `dist/main.js` with bun yourself, pass
`--no-install` too.
