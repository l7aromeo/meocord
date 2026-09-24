---
'meocord': patch
---

The warning about two component `customId` patterns that can match the same id, such as `a/{x}/c` and `a/b/{y}`, is logged when the bot starts, as the README describes, rather than at the first button, select menu or modal interaction. The routes are built once at startup and reused by every interaction.
