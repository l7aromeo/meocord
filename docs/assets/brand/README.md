# Brand files

Drawn with [meo-canvas](https://github.com/l7aromeo/meo-canvas) by `tools/brand/brand.ts`. Run `bun run brand` and commit what it writes here.

| File                 | What it is                                                            | Used by                                                      |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `banner-dark.webp`   | The README banner, animated, dark palette                             | GitHub, `prefers-color-scheme: dark`                         |
| `banner-light.webp`  | The README banner, animated, light palette                            | GitHub, `prefers-color-scheme: light`                        |
| `banner.webp`        | The README banner, animated, a mid-slate that reads on light and dark | npm, and the `<img>` fallback                                |
| `banner.png`         | `banner.webp` at the end of the loop, still                           | anywhere that does not animate                               |
| `social-preview.png` | 1280×640, the banner's scene in the dark palette                      | the repository's social preview (Settings → Social preview)  |
| `logo.svg`           | The mark on its graphite tile                                         | anywhere that scales                                         |
| `logo-512.png`       | The logo at 512 px                                                    | package listings, slides                                     |
| `logo-1024.png`      | The logo at 1024 px                                                   | the same, at high density                                    |
| `avatar.png`         | 1024 px square, the mark inset on the accent tint, full bleed         | the organization's and bots' avatars, which crop to a circle |

## The banner

It shows what a MeoCord user writes: a controller method with `@Command`, `@UseGuard` and `@Cooldown`, answering with `respond()`. A band steps down the lines in the order a call runs them, about 0.3 s each; as `respond()` runs, the reply fades up and the far ear tips. The loop is 2.5 s at 30 fps and has no seam. The ears sit on the code sheet's top edge, which covers their base.

The code comes from `tools/brand/banner-snippet.ts`, between its `// #region banner` markers. That file typechecks with the repository (`bun run lint`), so the banner cannot show an API that does not exist. To look at one moment of the loop, render it as a PNG:

```bash
BRAND_FRAME=1.55 BRAND_THEME=light BRAND_OUT=frame.png bun tools/brand/brand.ts
```

**Why three banners.** GitHub honours `<picture>` and `prefers-color-scheme`. npm drops the `<source>` elements and shows the `<img>`, so that file must read on a white page and a dark one.

**Absolute URLs.** The README links these files through `raw.githubusercontent.com` on `main`, since npm's package page cannot resolve a relative path.

**Size.** The animated files are about 170–180 KiB each, encoded at WebP quality 0.8. README images load on every package page view; if a change pushes them far past that, shorten the loop rather than commit it.

## The mark

The mark's paths live in `tools/brand/mark.ts`, the twin of `src/lib/brand/mark-paths.ts` in [meocord/docs](https://github.com/meocord/docs); change both together. From 48 px up the inner ears are cut out; below that the crown is drawn plain.

## Fonts

The type is [Instrument Sans](https://github.com/Instrument/instrument-sans) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), committed in `tools/brand/fonts/` and registered by the script, so a regeneration sets the same type on any machine. Both are under the SIL Open Font License 1.1; their licence texts are beside them.
