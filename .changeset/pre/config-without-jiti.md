---
'meocord': patch
---

Load the compiled config without a transpiler. A built bot reads `dist/meocord.config.mjs` with
`require()` and no longer falls back to `meocord.config.ts` when it is missing, so jiti stays out of
a bot bundled with `bundleDependencies`. `meocord build` fails when the config does not compile,
instead of warning and producing a bot that cannot start.
