---
'meocord': minor
---

Choose where commands are registered, and register without starting the bot.

- `commands` in `meocord.config.ts`: `guilds` registers to guilds instead of globally, `developmentGuild` sends everything to one test guild under `start --dev`, `register: false` leaves registration to `meocord register`, and `clearOther` removes commands left in a scope no longer used, which are otherwise reported as a warning.
- `@CommandBuilder(type, { guilds })` keeps one command in its own guilds, for staff commands.
- `meocord register [--build] [--dev] [--guild <id>]` registers over REST and exits, without logging in, and exits non-zero on failure.
- In development, a scope whose commands are unchanged since the last start is not sent again; `meocord start --dev --force-register` sends it anyway.
- Commands are read from the controllers' prototypes, so registering constructs no controller.

Nothing changes for an existing bot: with no `commands` setting, every command is still registered globally at each start. New applications get `developmentGuild` wired to `DEV_GUILD_ID` in `.env`.
