---
'meocord': minor
---

Add `respond(interaction)`, one place to answer an interaction, and presenters to style MeoCord's answers.

- `respond(interaction)` in `meocord/common` returns the interaction's response state: `acknowledge()`, `send()`, `edit()`, `followUp()`, `delete()`, `modal()` and `error()`. Each picks the Discord call from where the answer stands — reply, update or edit — re-read from the interaction on every call, so answers made directly with discord.js still count. Flags are computed per call, so an ephemeral follow-up never leaks into the next message; Components V2 edits keep their flag; re-sent Discord attachment images are pointed at `attachment://`.
- Answers go through the interaction's own methods, which work wherever a user-installed app is used. The channel is used only once the interaction's token has expired and the bot is present. `getInstallContext(interaction)` reports where an interaction happened and whether the bot is there.
- `error(error, { message, visibility })` shows an error and never throws. The built-in fallback now answers through it, so an error on a private (ephemeral) component message is added to that message rather than sent separately.
- `@MeoCord({ presenter })` takes a `ResponsePresenter` that styles the error and loading views. Without one, errors look as before, and the loading view is "⏳ Working on it…" in the new `Theme.primaryColor`.
- Interceptors and filters reach the state as `context.response`.
- Testing: `getResponse(interaction)` reports what `respond()` sent; `createDiscordError(code)` builds the error discord.js throws; mock messages carry real, empty `flags`, `components`, `embeds` and `attachments`; mock `showModal()` and a modal submission's `deferUpdate()` answer the interaction as the real ones do.
