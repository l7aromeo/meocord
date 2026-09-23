---
'meocord': major
---

**Breaking:** `app.start()` rejects when the login fails. It logged the error and resolved, so a bot
with an invalid token went on to log "Application started" and exit with code 0, which Docker's
`restart: on-failure`, systemd and CI all read as success. It now sets the exit code to 1 before
rejecting, so a bot that fails to log in exits 1 with its entry point unchanged. See the
[migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#4-build-and-start).
