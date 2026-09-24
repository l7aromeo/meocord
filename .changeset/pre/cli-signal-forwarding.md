---
'meocord': patch
---

`meocord start` and `meocord register` pass SIGINT and SIGTERM on to the bot. A signal sent to the CLI alone, as Docker, pm2 and systemd send one, used to stop the CLI and leave the bot running, or, with SIGINT, not stop it at all; the bot now shuts down through its own shutdown path and the CLI exits with its code. One Ctrl+C that reaches a process twice within a second counts once, so it no longer force-kills the shards in process sharding; a second signal after that still stops everything at once.
