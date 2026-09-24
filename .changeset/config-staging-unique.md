---
'meocord': patch
---

Fix two `meocord.config.ts` compiles running at once in one project, such as the development watcher's rebuild and a `meocord build`, interfering with each other. Both staged the compiled config in one `dist/.meocord-config` folder, so one could delete or move the other's output and fail with a missing file. Each compile now stages in a folder of its own and removes it afterwards.
