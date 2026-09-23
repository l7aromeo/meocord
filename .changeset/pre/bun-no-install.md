---
'meocord': patch
---

pr: #22

Start the bot with `bun --no-install` from `meocord start`. Without it, bun downloads any package it
cannot find while the bot runs, which a bot deployed without `node_modules` would do in
production. If you start `dist/main.js` with bun yourself, pass the flag too.
