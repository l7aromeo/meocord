---
'meocord': patch
---

The CLI stops sooner and says what to do when something is wrong.

- `build`, `start` and `register` check `meocord.config.ts` first. One that fails to load stops them, naming the file and line, instead of building on. Options of the wrong type, such as `sharding.mode: 'bogus'` or `optionalExternals: 'sharp'`, stop them with a list of every problem, where before some built silently and others failed with an internal error. An option MeoCord does not know is reported as a warning. `start --prod` without `--build` checks the built config the same way, and says when there is no config at all.
- The compiled config is written only once it has built, so a failed build no longer leaves a broken `dist/meocord.config.mjs` for every later command to trip over.
- `meocord generate` refuses names that leave its folder (`..`, a leading `/`, a drive letter), which could write outside `src/` or the project, and asks to be run from a project's root. On Windows, `\` separates folders in a name.
- `meocord create` refuses a name with no letters or digits, which was reported as `Directory "" already exists`.
- A missing token is reported with where it comes from: `discordToken` in `meocord.config.ts`, which a new app reads from `DISCORD_TOKEN` in `.env`.
- `start --dev --build` builds once, as the watcher does, instead of twice.
