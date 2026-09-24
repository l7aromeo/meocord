---
'meocord': patch
---

`meocord start --dev` restarts the bot on the next rebuild after it exited on its own, such as after an error at startup, and Ctrl+C then stops the watcher at once instead of waiting for a second Ctrl+C. The bot started through `npm run` from a script bun runs is launched on node again, rather than handed to npm.
