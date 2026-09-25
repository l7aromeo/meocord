---
'meocord': patch
---

Mocks from `meocord/testing` behave more like discord.js. An interaction mock has a `locale` of `'en-US'`, and a `guildLocale` of `'en-US'` with a `guildId` and `null` without, so `t.for(interaction, { public: true })` works on a default mock. A method that returns a promise in discord.js now resolves instead of returning `undefined`, so `await` and `.catch()` work without setup. `send()` and `reply()` resolve to a mock message. A manager's `fetch(id)`, `create()` and `edit()` resolve to a mock of its item, and a list fetch to an empty `Collection`. `createDM()` resolves to a DM channel, and a structure's own `edit()`, `fetch()` and setters to the structure itself. `mockResolvedValue` and `mockRejectedValue` still override them.
