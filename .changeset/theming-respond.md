---
'meocord': minor
---

`respond()` and MeoCord's own views take their colours from the call's theme. An embed with no `color`, and a Components V2 container with no `accent_color`, sent through `respond()`, get the theme's `primary`; a colour that is set, `0` and a `null` accent included, is kept, and the app's builders are not changed. Answers a bot sent through `respond()` without a colour now show the primary colour, `#7680F4` unless the app's theme changes it.

A presenter's `ResponseContext` gains `theme`, the call's resolved theme, and `PresentedError` gains `tone`, `'warning'` for the user's own outcome and `'danger'` for a fault, so `color: context.theme.colors[tone]` styles an error by kind. MeoCord's default presenter does so, and shows its loading view with the theme's loading emoji. A presenter test that builds a `ResponseContext` or a `PresentedError` by hand, as the app template's does, needs `theme` and `tone` added.

`respond(interaction)` outside any call, as in a collector's `collect` callback, takes the theme of the app the interaction came to, with its server's and user's themes from `themeFor`, so a collector's answers are themed with no extra code.
