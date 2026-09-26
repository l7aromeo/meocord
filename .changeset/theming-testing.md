---
'meocord': minor
---

Themes in tests. A testing module runs each call in its theme as the bot does, through `invoke` and `dispatch` alike, and `meocord/testing` has what a test needs to set or check one:

- `overrideTheme(theme)` on the builder changes part of the app's `@MeoCord({ theme })` for that module, naming only the tokens it changes, or gives a module without an app a theme, beneath each `@UseTheme`; `overrideThemeFor(resolvers)` replaces the app's `themeFor`, or removes it with `undefined`. Both are checked as `@MeoCord` checks them.
- `module.themeCache` is the module's `ThemeCache`, to clear what `themeFor` looked up in its calls. Each module has its own.
- `createMockTheme(overrides?)` returns a whole, frozen theme, the defaults with `overrides` merged, to pass where code takes a theme or to compare against; `withTheme(theme, fn)` runs a service or presenter in a theme without a module.
- Once `init({ ready: true })` has run, the module's app theme is the one `useTheme()` reads outside any call, as a bot's is once online, until `close()`. The first module ready in the process keeps it; another module's calls still read their own theme.
