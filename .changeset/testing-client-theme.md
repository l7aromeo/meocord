---
'meocord': patch
---

In a testing module, `respond()` outside any call, as in a collector's callback, answers in the module's theme, with the server's and user's themes over it, as the bot does. It used MeoCord's defaults, since only the bot made itself the app of its client. `invoke` and `dispatch` now do the same for the client of the interaction, message or reaction they are given, so a click built with that client, `createMockInteraction(ButtonInteraction, { client: interaction.client })`, answers in the module's theme.
