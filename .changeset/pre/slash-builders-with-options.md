---
'meocord': patch
---

pr: #24

Accept slash command builders that add options. `@CommandBuilder(CommandType.SLASH)` rejected
`new SlashCommandBuilder().addStringOption(...)`, whose type narrows to
`SlashCommandOptionsOnlyBuilder`, so the most common builder — one command with an option — did
not compile.
