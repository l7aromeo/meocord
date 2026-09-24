---
'meocord': minor
---

Choose where commands are registered, and register without starting the bot.

- `commands` in `meocord.config.ts`: `guilds` registers to guilds instead of globally, `developmentGuild` sends everything to one test guild under `start --dev`, `register: false` leaves registration to `meocord register`, and `clearOther` removes commands left in a scope no longer used, which are otherwise reported as a warning; a development run sending to `developmentGuild` only warns, since production may share the application.
- `@CommandBuilder(type, { guilds })` keeps one command in its own guilds, for staff commands.
- `meocord register [--build] [--dev] [--guild <id>]` registers over REST and exits, without logging in, and exits non-zero on failure.
- In development, a scope whose commands are unchanged since the last start is not sent again; `meocord start --dev --force-register` sends it anyway.
- Commands are read from the controllers' prototypes, so registering constructs no controller.

With no `commands` setting, an existing bot still registers every command globally at each start. One thing does change: a builder whose `toJSON()` throws, such as a slash command missing its description, now stops that start's registration. You see an error naming the builder, and no commands are sent, where before the rest were registered and the broken one was dropped. A bulk update without it would delete it from Discord. Fix the builder and the next start registers everything.

New applications get `developmentGuild` wired to `DEV_GUILD_ID` in `.env`.
