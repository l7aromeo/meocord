---
'meocord': minor
---

pr: #22

Add `bundleDependencies`, which puts everything a bot needs inside `dist`, so it deploys without
`node_modules` or an install step. Plain JavaScript dependencies are bundled into `main.js`. Native
addons such as `sharp` are found while building and copied, with their platform binary, into
`dist/node_modules` — nothing has to be listed. Only binaries for the platform building are copied,
whichever package manager installed them.

A build carrying native addons records its platform in `dist/meocord.platform.json`, and a bot
started on another platform stops before going online with a message naming both. Build on the
platform you deploy to. See
[Self-contained builds](https://github.com/l7aromeo/meocord#self-contained-builds).
