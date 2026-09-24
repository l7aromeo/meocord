---
'meocord': patch
---

`process.env` values loaded by `meocord.config.ts` are set before the application's modules run. `main.ts` imports `App` before anything else, so an option such as `@MeoCord({ activities: [{ name: process.env.STATUS! }] })` read the environment before the config's `dotenv` import had loaded `.env`, and got `undefined`. The build now loads `dist/meocord.config.mjs` ahead of `main.ts`, for every way of starting the bundle. Rebuild to pick it up; no code changes. The README shows how to choose a `.env` file per environment.
