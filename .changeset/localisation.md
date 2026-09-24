---
'meocord': minor
---

Translate commands and replies from typed catalogs.

- `createTranslator({ default, locales })` in `meocord/common` builds a translator from one catalog per discord.js `Locale`. Keys, `{name}` params and plural forms (`{ one, other, … }`, chosen through `Intl.PluralRules`) are type-checked against the default catalog, which `defineCatalog(...)` or `as const` keeps literal; other locales may leave messages out, and fall back to a locale of the same language, then the default.
- `t.default(key)` and `t.localizations(key)` fill command builders; `t.for(interaction)`, `t.for(interaction, { public: true })`, `t.forGuild(guild)` and `t.locale(locale)` translate replies.
- `@MeoCord({ i18n: t })` injects it as `Translator`.
- `expectCompleteCatalog` in `meocord/testing` reports missing messages and plural forms per locale.
- Registration refuses localised names and descriptions Discord would reject, listing each field, and a builder that throws while building now names itself and the command.

Nothing changes for a bot that does not use it.
