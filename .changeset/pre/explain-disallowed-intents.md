---
'meocord': patch
---

When Discord refuses a privileged intent at login, the bot now says which privileged intents it requests (`GuildMembers`, `GuildPresences`, `MessageContent`) and where to enable them — Developer Portal → your application → Bot → Privileged Gateway Intents — and that a verified bot in 100 or more servers needs Discord's approval for them. Before, it printed only "Used disallowed intents" and a stack trace. Intents Discord refuses as invalid are explained too. The stack trace moves to debug level; the exit code and the error `app.start()` rejects with are unchanged.
