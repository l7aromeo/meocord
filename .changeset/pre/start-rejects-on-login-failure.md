---
'meocord': major
---

**Breaking:** `app.start()` rejects when the login fails. It logged the error and resolved, so a bot
with an invalid token went on to log "Application started" and exit with code 0, which Docker's
`restart: on-failure`, systemd and CI all read as success. New applications' `main.ts` sets
`process.exitCode = 1` when startup fails; add the same to an existing entry point's `catch`. See the
[migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#4-build-and-start).
