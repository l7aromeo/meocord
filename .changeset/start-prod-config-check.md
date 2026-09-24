---
'meocord': patch
---

`meocord start --prod` without `--build` reports a missing or broken `meocord.config.ts` the way `build` does. With no config file and nothing built, it said the config "must export an object as its default export (got undefined)"; it now says the file is missing. A config that fails to load is reported once, with the file and line, instead of being followed by that same misleading line.
