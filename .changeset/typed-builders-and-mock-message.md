---
'meocord': patch
---

Accept a slash command builder that adds options. Chaining an option onto `SlashCommandBuilder`
narrows it to `SlashCommandOptionsOnlyBuilder`, which `@CommandBuilder(CommandType.SLASH)`
rejected — so the most common builder, one command with an option, did not compile. All three
forms a slash builder takes are now accepted.

Type `deleted` on `createMockMessage()`. The mock has always tracked it and documented it, but
`message.deleted` was not part of its type and did not compile.
