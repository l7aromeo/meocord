---
'meocord': patch
---

pr: #22

Read `meocord.config.ts` on every build. `meocord build` read the compiled `dist/meocord.config.mjs`
left by the previous build, so a config edit took effect one build late, and the watcher's reload
on a config change reloaded nothing.
