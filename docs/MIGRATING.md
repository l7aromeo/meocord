# Migrating from MeoCord 3 to 4

MeoCord 4 builds with [Rsbuild](https://rsbuild.rs) instead of webpack, and requires dotenv 18 and Node.js
22.13. Most bots need two changes: upgrade dotenv, and rename one hook in `meocord.config.ts`. Everything
else is either unchanged or new and optional.

## Checklist

- [ ] Run Node.js 22.13 or newer, if you run Node 22
- [ ] Upgrade `dotenv` to 18
- [ ] Rename the `webpack` hook in `meocord.config.ts` to `rsbuild`, and reshape its body
- [ ] Replace any use of the `MeoCordWebpackConfig` type
- [ ] Run `meocord build` and `meocord start`
- [ ] Optional: turn on `bundleDependencies` to deploy without `node_modules`

MeoCord 4 needs Node.js 22.13 or newer; MeoCord 3 accepted any Node 22. discord.js 14 is still what it
needs. Bun is unaffected.

## Before you start: Node.js 22.13

A built bot loads its compiled config with `require()` of an ES module. Node runs that without a flag from
22.12, but 22.12 still prints an experimental warning on every start and crashes on a config that throws,
rather than letting MeoCord report it; 22.13 does neither. On 22.0 to 22.11 the bot cannot load its config
and stops before logging in. Check with `node --version`, and update the Node version in your Dockerfile, CI
or hosting settings if it pins an older 22.

## 1. Upgrade dotenv to 18

MeoCord's `dotenv` peer dependency moved from `^17.4.2` to `^18.0.3`.

```shell
npm install dotenv@18
```

Your code does not change. `import 'dotenv/config'`, the form MeoCord's generated apps use, behaves the same
in 18. Two differences to know about:

- dotenv 18 dropped `.env.vault` support. If you used it, move those variables to your deployment's
  environment or a plain `.env` file.
- Its injection notice (`◇ injected env (…) from .env`) now goes to stderr instead of stdout. That matters
  only if a script parses the bot's stdout.

Until dotenv is upgraded, installing MeoCord 4 fails with `ERESOLVE` on npm 7+, errors on pnpm, and warns on
bun and yarn.

## 2. Replace the `webpack` hook with `rsbuild`

A `meocord.config.ts` that still declares `webpack` stops the build with a message pointing here, rather
than building with your customisation silently ignored.

The hook works the same way — it receives the configuration and returns it, modified — but the
configuration is now Rsbuild's. Many webpack rules have no counterpart to write, because Rsbuild does that
work itself.

**Before** — the hook MeoCord 3's generated apps shipped with:

```typescript
import { type MeoCordConfig } from 'meocord/interface'

export default {
  discordToken: process.env.DISCORD_TOKEN!,
  webpack: config => {
    config.module.rules?.push({
      test: /\.(md|html)$/i,
      type: 'asset/source',
    })
    config.module.rules?.push({
      test: /\.(gif|jpg|jpeg|png|svg|woff|woff2|eot|ttf|otf)$/i,
      type: 'asset/resource',
      exclude: /node_modules/,
      generator: { filename: 'assets/[name][ext]' },
    })
    return config
  },
} satisfies MeoCordConfig
```

**After:**

```typescript
import { type MeoCordConfig } from 'meocord/interface'

export default {
  discordToken: process.env.DISCORD_TOKEN!,
  rsbuild: config => {
    // Images, fonts, svg and media need no rule: Rsbuild emits them to dist/assets/ itself.
    // Markdown and HTML still need one, for `import readme from './readme.md'` to give its text.
    config.tools ??= {}
    config.tools.rspack = (_rspackConfig, { addRules }) => {
      addRules([{ test: /\.(md|html)$/i, type: 'asset/source' }])
    }
    return config
  },
} satisfies MeoCordConfig
```

If your hook did nothing but these two rules, you can delete the markdown rule too when you do not import
`.md` or `.html` files — and then the whole hook.

### Where each webpack setting goes

| webpack (MeoCord 3)                                 | Rsbuild (MeoCord 4)                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `asset/resource` rule for images, fonts, svg, media | Nothing. Emitted to `dist/assets/` by default                                                   |
| `generator.filename` on that rule                   | `output.filename.image` (and `svg`, `font`, `media`) — a string or a function                   |
| `asset/source` rule                                 | `tools.rspack` → `addRules([{ test, type: 'asset/source' }])`                                   |
| Any other `module.rules` entry                      | `tools.rspack` → `addRules([...])`; it takes the same webpack-shaped rule                       |
| `plugins`                                           | `tools.rspack` → `appendPlugins(...)`, or an [Rsbuild plugin](https://rsbuild.rs/plugins/list/) |
| `devtool`                                           | `output.sourceMap.js`                                                                           |
| `resolve.alias`                                     | `resolve.alias`                                                                                 |
| `externals`                                         | MeoCord's own `externals` option, alongside `rsbuild`                                           |
| `optimization.minimizer`                            | `output.minify`                                                                                 |

### Custom asset file names

MeoCord 3's template wrote every asset flat into `dist/assets/[name][ext]`. MeoCord 4 does the same by
default. If you gave the webpack rule a `generator.filename` function — typically to keep two files with the
same name in different folders from colliding — move it to `output.filename`. It is joined to `dist/assets/`,
so return a path relative to that:

```typescript
import path from 'node:path'
import { type MeoCordConfig } from 'meocord/interface'

export default {
  discordToken: process.env.DISCORD_TOKEN!,
  rsbuild: config => {
    config.output ??= {}
    config.output.filename = {
      ...config.output.filename,
      // src/assets/image/hsr/star.webp -> dist/assets/image/hsr/star.webp
      image: ({ filename }) =>
        path
          .relative('src/assets', filename ?? '')
          .split(path.sep)
          .join('/'),
    }
    return config
  },
} satisfies MeoCordConfig
```

Do not spread `config.output.distPath` to change a directory: its type is `string | DistPathConfig`, and
spreading a possible string does not compile under `strict`.

### Things that stay the same

You do not need to check these; they are listed so you know what was kept:

- The output layout: `dist/main.js`, assets under `dist/assets/` without content hashes, and
  `dist/meocord.config.mjs`.
- Asset imports resolve to absolute paths on disk, ready for `fs`, canvas, or a Discord attachment. No asset
  is ever inlined as a data URI, whatever its size.
- Source map types: `source-map` in production, `eval-source-map` in development. Where a production map
  points is different; see [Build and start](#4-build-and-start).
- Production builds are minified and keep class and function names, which dependency injection relies on.

## 3. Replace `MeoCordWebpackConfig`

The `MeoCordWebpackConfig` type is removed. If you typed a hook or a helper with it, use Rsbuild's config
type instead:

```typescript
import { type RsbuildConfig } from 'meocord/interface'

export function addMarkdown(config: RsbuildConfig): RsbuildConfig {
  config.tools ??= {}
  config.tools.rspack = (_rspackConfig, { addRules }) => {
    addRules([{ test: /\.md$/i, type: 'asset/source' }])
  }
  return config
}
```

MeoCord re-exports the type, so this works without adding `@rsbuild/core` to your own dependencies — which pnpm would require if you imported it from there directly.

## 4. Build and start

```shell
npx meocord build --prod
npx meocord start --prod
```

Four things behave differently:

- **Builds read `meocord.config.ts` every time.** MeoCord 3 read the compiled copy the previous build left
  in `dist`, so a config edit took effect one build late, and the watcher's reload on a config change
  reloaded nothing. If you worked around that by building twice or deleting `dist`, you can stop.
- **`meocord start` runs bun with `--no-install`.** Without it, bun downloads any package it cannot find at
  runtime. If you launch `dist/main.js` with bun directly — a Docker `CMD`, for example — add the flag
  yourself: `bun --no-install dist/main.js`.
- **Production source maps name real paths.** `dist/main.js.map` lists each source relative to `dist`, as
  `../src/app.ts`, where webpack wrote `webpack://<your-app>/./src/app.ts`. Node and bun resolve either, so
  stack traces are unaffected. An error tracker that uploads source maps and rewrites or matches paths by the
  `webpack://` prefix needs that rule updated.
- **A failed login fails the start.** `app.start()` rejects when Discord refuses the token or cannot be
  reached, and the process exits with code 1. It used to log the error and resolve, so `main.ts` went on
  to log "Application started" and the process exited 0 — which Docker's `restart: on-failure`, systemd
  and CI read as success. The generated `main.ts` needs no change: its `catch` still logs the error.
  Code that awaits `start()` and carries on after it failed now gets the error instead.

## 5. Optional: deploy without `node_modules`

MeoCord 4 can put everything a bot needs inside `dist`, so deploying is copying one directory:

```typescript
import { type MeoCordConfig } from 'meocord/interface'

export default {
  discordToken: process.env.DISCORD_TOKEN!,
  bundleDependencies: true,
} satisfies MeoCordConfig
```

Plain JavaScript dependencies are bundled into `main.js`. Native addons — packages with a compiled `.node`
binary, such as `sharp` or a canvas binding — cannot be inlined, so MeoCord finds them while building and
copies each one, with its binary, into `dist/node_modules`. You list nothing; the build prints what it
packed.

A build with native addons only runs on the operating system, CPU and C library it was built on. **Build on
the platform you deploy to** — for a container, inside the image:

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bunx meocord build --prod

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app/dist ./dist
CMD ["bun", "--no-install", "dist/main.js"]
```

The build records its platform in `dist/meocord.platform.json`. A bot started anywhere else stops before
going online and says so, instead of failing on the first command that loads the addon.

See [Self-contained builds](https://github.com/l7aromeo/meocord#self-contained-builds) in the README for the
details.

## If your app was generated by MeoCord 3

These changes are in MeoCord 4's app template. They are not required for an existing app, but are worth
taking if you upgrade the same tools in yours:

- **vitest 5 and `@vitest/coverage-istanbul` 5.** vitest 5 removed `coverage.all`, so `all: false` no longer
  keeps files no test imports out of coverage — and istanbul's parser fails on a decorated one:
  `Support for the experimental syntax 'decorators' isn't currently enabled`. Remove `all: false` and exclude
  your decorated entry files:

  ```typescript
  coverage: {
    provider: 'istanbul',
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.spec.ts', 'src/app.ts', 'src/main.ts'],
  },
  ```

- **`unplugin-swc` 2** needs no configuration change; `swc.vite({ ... })` takes the same options.

- **`meocord.config.ts` in `tsconfig.json`.** The template now lists it under `include` rather than
  `exclude`, so `tsc` in your `lint` script typechecks the config, and your editor resolves `paths`
  aliases in it — `import '@src/common/utils/load-env.util'` — the way the build already does. `noEmit`
  stays on, so nothing is written beside it:

  ```json
  "include": ["src/**/*.ts", "meocord.config.ts"],
  "exclude": ["dist", "vitest.config.ts", "node_modules", "src/**/*.spec.ts"]
  ```

## Fixed along the way

Two type errors that MeoCord 3 users hit are fixed. If you worked around them with a cast, you can remove it:

- A slash command builder that adds options — `new SlashCommandBuilder().addStringOption(...)` — was
  rejected by `@CommandBuilder(CommandType.SLASH)`. All three forms a slash builder takes are accepted now.
- `createMockMessage().deleted` did not compile, though the mock always tracked it. It is typed now.

---

Something here did not match what you saw? [Open an issue](https://github.com/l7aromeo/meocord/issues/new/choose).
