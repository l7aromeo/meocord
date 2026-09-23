---
'meocord': patch
---

Keep jiti out of bots built with `bundleDependencies`. A built bot loaded `dist/meocord.config.mjs`,
already compiled JavaScript, through jiti, and the logger and the factory both reach that loader,
so jiti was bundled into every bot: 190 KB, 89% of a minimal bot's `main.js`, and a
`Critical dependency` warning on every build. The compiled config is now loaded with `require()`,
and jiti is only used by the CLI to read `meocord.config.ts`. A minimal bot bundles to 22 KB.

A built bot no longer falls back to reading `meocord.config.ts` when `dist/meocord.config.mjs` is
missing, and `meocord build` now fails when the config does not compile, instead of warning and
producing a bot that cannot start.
