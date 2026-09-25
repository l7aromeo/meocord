---
'meocord': patch
---

`respond()` reads discord.js's deprecated `ephemeral: true` as `flags: MessageFlags.Ephemeral`, so a private follow-up on a public deferred reply is no longer shown to everyone as an edit of that reply, and tests see the privacy the bot sends; `flags: MessageFlags.Ephemeral` is the supported form.
