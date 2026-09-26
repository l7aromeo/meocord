---
'meocord': minor
---

Themes: design tokens by role, which the bot's answers take their colours, emojis and button styles from.

- `meocord/interface` has the theme's types: `ThemeColors` (`primary`, `neutral`, `success`, `warning`, `danger`, `info`), `ThemeEmojis` (`loading`, `success`, `warning`, `danger`, `info`) and `ThemeButtons` (`primary`, `neutral`, `success`, `danger`), grouped in `MeoCordTheme`. `ThemeOverride` is a part of one, `RootTheme` the app's own theme, and `DeepReadonly<MeoCordTheme>` a theme as code reads it. An app adds tokens by augmenting these interfaces from a module; see [Theming](https://github.com/meocord/meocord/blob/main/README.md#theming). The tokens an app adds have no default, so `RootTheme` requires them, and a role named from `ReservedThemeRole` is refused at the root theme with the role named.
