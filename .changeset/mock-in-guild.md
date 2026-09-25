---
'meocord': patch
---

`inGuild()`, `inCachedGuild()` and `inRawGuild()` on a mock answer from its `guildId` and `guild`, so a mock created without a `guildId` is a DM and a guard that requires a guild returns `false`, not `undefined`.
