---
'meocord': minor
---

`Theme` from `meocord/common` is deprecated, and goes in MeoCord 5. Its colours now read the theme where they are read, so code written against `Theme.primaryColor` follows `@MeoCord({ theme })` and `@UseTheme` with no change, and `errorColor` is the `danger` role. Their values are the new defaults; 4.0's were `primaryColor` `#5865F2`, `successColor` `#28A745`, `infoColor` `#17A2B8`, `errorColor` `#DC3545` and `warningColor` `#FFC107`, which `@MeoCord({ theme })` sets again if you want them. Assigning one still recolours MeoCord's views, beneath every theme an app sets, and logs a warning once per colour; see [Migrating from `Theme`](https://github.com/meocord/meocord/blob/main/README.md#migrating-from-theme).
