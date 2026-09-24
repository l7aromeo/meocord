# Migrating from MeoCord 3 to 4

MeoCord 4 builds with [Rsbuild](https://rsbuild.rs) instead of webpack, and requires dotenv 18 and Node.js
22.13. Most bots need two changes: upgrade dotenv, and rename one hook in `meocord.config.ts`. Everything
else is either unchanged or new and optional.

## Checklist

- [ ] Run Node.js 22.13 or newer, if you run Node 22
- [ ] Upgrade `dotenv` to 18
- [ ] Rename the `webpack` hook in `meocord.config.ts` to `rsbuild`, and reshape its body
- [ ] Replace any use of the `MeoCordWebpackConfig` type
- [ ] Stop importing MeoCord's internal routing helpers from `meocord/decorator`, if you did
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

Five things behave differently:

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
- **`lint` covers `meocord.config.ts`.** The shared config from `meocord/eslint` used to skip it, so
  upgrading can surface lint findings in that file for the first time — typically an unused import. If
  ESLint instead reports that `meocord.config.ts` is not included in any of the provided projects, add it to
  `include` in `tsconfig.eslint.json`, as apps generated by MeoCord 3.2 already have it.

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

## Internal helpers are no longer exported

`meocord/decorator` exported six helpers the framework uses to route interactions: `getCommandMap`,
`getMessageHandlers`, `getReactionHandlers`, `getAutocompleteHandlers`, `findAmbiguousRoutes` and
`PARAM_SEPARATOR`. They are internal now, and `meocord/decorator` exports only the decorators. An app
that imported one fails to compile with "has no exported member"; the routing they expose is
MeoCord's to change, so remove the dependency rather than copy the helper.

If you used them to test which handler a customId reaches, `resolveRoute` and `findRouteConflicts`
from `meocord/testing` answer that directly, the way dispatch does:

```typescript
const route = resolveRoute(App, { type: CommandType.BUTTON, customId: 'profile/111/8000' })
expect(route?.handler).toBe(ProfileController.prototype.showProfile)
expect(findRouteConflicts(App)).toEqual([])
```

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

Three type errors that MeoCord 3 users hit are fixed. If you worked around them with a cast or a
`// @ts-expect-error`, you can remove it:

- A slash command builder that adds options — `new SlashCommandBuilder().addStringOption(...)` — was
  rejected by `@CommandBuilder(CommandType.SLASH)`. All three forms a slash builder takes are accepted now.
- `createMockMessage().deleted` did not compile, though the mock always tracked it. It is typed now.
- A CommonJS project — `require('meocord/core')`, or TypeScript with `module: node16` — got the ES module
  declarations and was told it could not `require` MeoCord. Each entry point now ships CommonJS declarations
  too.

## Upgrading from 4.0 to 4.1

4.1 is a minor release: a 4.0 bot and its tests build and run without edits. The fixes below change
what a bot does at runtime; each says what to check. Everything else in 4.1 is new and optional, and
[Adopting 4.1 patterns](#adopting-41-patterns) shows where it can replace code you wrote yourself.

- [ ] Check class guards on controllers that extend another controller
- [ ] Check class guards on controllers with `@Autocomplete` handlers
- [ ] Check what users see when a command throws after it replied or deferred
- [ ] Fix any command builder that throws, since it now stops registration
- [ ] Fix or replace the generated `src/guards/rate-limit.guard.ts`, if your app still has it
- [ ] Rebuild

### Class guards now cover inherited handlers

A class-level `@UseGuard` on a controller that extends another controller now guards the handlers it
inherits too. In 4.0 it guarded only the handlers the subclass declared itself, so inherited commands,
components, message and reaction handlers ran without the subclass's guards.

```typescript
@Controller()
@UseGuard(StaffGuard)
export class AdminController extends ModerationController {}
```

In 4.1, `ModerationController`'s handlers, when reached through `AdminController`, run `StaffGuard`
first, then `ModerationController`'s own guards. If a bot relied on inherited handlers skipping the
subclass's guards, move those handlers out of the subclass, or give the subclass a guard that allows
them. The base controller itself is unaffected.

### Class guards now cover autocomplete handlers

A class-level `@UseGuard` now also guards the controller's `@Autocomplete` handlers. In 4.0 it guarded
commands, components, message and reaction handlers, and autocomplete handlers ran without it.

A guard there receives an `AutocompleteInteraction`: it has no `reply()`, and an autocomplete request
must be answered within three seconds. A guard that denies returns `false`, and MeoCord closes the menu
with an empty list. Check a class guard that reads command-only data, such as a chat input option it
requires, or that replies on denial:

```typescript
canActivate(interaction: BaseInteraction): boolean {
  if (interaction.isAutocomplete()) return true // or decide from interaction.user, without replying
  // ...
}
```

With `ExecutionContext` injected, `this.context.getType() === 'autocomplete'` tells the same.

### Errors after a reply or deferral are answered

A command that throws after `deferReply()` now has its deferred reply edited into the error message,
instead of showing "thinking…" until Discord times it out. A command or component that throws after it
already replied now gets a private follow-up with the error, where 4.0 sent nothing. A button, select
menu or modal submitted from a public message is answered with a private follow-up, never by editing the
message the user clicked; on a private (ephemeral) message, the error is added to that message.

If a handler relied on the old silence, for instance because it edits its own reply into an error
before rethrowing, register an [exception filter](../README.md#exception-filters) that handles the
error: filters run before the built-in answer and replace it.

```typescript
@Catch()
export class LogOnlyFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors')

  catch(error: unknown): void {
    this.logger.error(error)
  }
}
```

### A command builder that throws stops registration

Registration now builds every command before sending any. A builder whose `toJSON()` throws, such as a
slash command without a description, stops that start's registration with an error naming it, and no
commands are sent. 4.0 dropped the broken command and registered the rest, and the bulk update deleted
it from Discord. Fix the builder; the next start registers everything.

### The generated rate-limit guard limits

The `RateLimitGuard` that `meocord create` copied into 4.0 applications never limited anything: a new
guard instance is created for every call, so the counts it kept on the instance started empty each time.
Upgrading `meocord` does not change your copy. Move its `rateLimits` map out of the class to module
level, so every instance shares it, or drop the guard for [`@Cooldown`](#adopting-41-patterns), which
does the same job without code of your own and is what new applications use.

### Smaller changes

- `process.env` values that `meocord.config.ts` loads are set before any application module runs,
  after a rebuild. An option such as `@MeoCord({ activities: [{ name: process.env.STATUS! }] })` read
  `undefined` in 4.0.
- A modal handler's second argument also carries the submitted fields, keyed by customId, beside the
  customId params. A param wins over a field of the same name.
- `createMockInteraction(ModalSubmitInteraction).isFromMessage()` returns `true` only when the mock has a
  `message`, as a real modal does, rather than `undefined`.
- `MeoCordFactory.create()` returns the `MeoCordApplication` type from `meocord/interface`, with the same
  `start()` and `registerCommands()`.

## Adopting 4.1 patterns

Nothing here is required. Each item replaces something a 4.0 bot had to write by hand; see the
[README](../README.md) for the full feature.

**Handler metadata: `createMetadata` and `ExecutionContext`.** A 4.0 guard read `SetMetadata` values
with `Reflect.getMetadata`, and reading them from the interaction found nothing. Declare the decorator
with `createMetadata` and inject `ExecutionContext` into the guard; its value is typed, and the
handler's wins over the controller's.

```typescript
// 4.0
export const Roles = (...roles: string[]) => SetMetadata('roles', roles)
const required: string[] = Reflect.getMetadata('roles', interaction.constructor) ?? []

// 4.1
export const Roles = createMetadata<string[]>('roles')

@Guard()
export class RolesGuard implements GuardInterface {
  constructor(private readonly context: ExecutionContext) {}

  canActivate(interaction: ChatInputCommandInteraction): boolean {
    const required = this.context.get(Roles) ?? []
    // ...
  }
}
```

**Answering: `respond()`.** Checks such as `interaction.deferred || interaction.replied` before choosing
between `reply`, `editReply`, `update` and `followUp` can go: `respond(interaction).send(...)` picks the
call from where the answer stands, and `acknowledge()` defers once however often it is called. It
answers through the interaction's own methods, so it also works where a user-installed app is used
without the bot. A custom error embed built in each handler or filter can become a presenter,
registered with `@MeoCord({ presenter })`, which styles every error MeoCord shows.

```typescript
// 4.0
if (interaction.deferred || interaction.replied) await interaction.editReply(payload)
else await interaction.reply(payload)

// 4.1
await respond(interaction).send(payload)
```

**Deferring and locking: `@Defer`.** A handler that called `deferReply()` or `deferUpdate()` first, then
disabled its message's buttons and put them back when done, can take `@Defer()` instead. It acknowledges
before guards run, locks a component's message with a loading view once the call is allowed, and
`respond(interaction).send()` without `components` puts the buttons back as they were — including ones
disabled on purpose.

```typescript
// 4.0
await interaction.deferUpdate()
await interaction.message.edit({ components: disabledCopyOf(interaction.message.components) })
// ...work...
await interaction.editReply({ embeds: [card], components: interaction.message.components })

// 4.1
@Defer()
async refresh(interaction: ButtonInteraction) {
  // ...work...
  await respond(interaction).send({ embeds: [card] })
}
```

**Denying with a message: `GuardDeniedError`.** Instead of replying from the guard and returning
`false`, throw `new GuardDeniedError('Only the owner can use this.')`. The user who made the call sees
the message privately, and an exception filter can phrase it otherwise.

**Rate limits: `@Cooldown`.** The generated `RateLimitGuard`, or a guard of your own that counts calls,
can become `@Cooldown({ uses: 5, seconds: 60 })` on the handler or the controller. It counts per user,
server, channel or for everyone, only once guards and validation have let the call through, and answers
a blocked call privately with how long to wait. With process sharding, pass a shared `CooldownStore`,
such as one on Redis, to `@MeoCord({ cooldownStore })`.

```typescript
// 4.0
@UseGuard({ provide: RateLimitGuard, params: { limit: 5, windowInSeconds: 60 } })

// 4.1
@Cooldown({ uses: 5, seconds: 60 })
```

**Guards for the whole bot: `@MeoCord({ guards })`.** A guard repeated on every controller, such as a
blocklist, can be listed once in `@MeoCord`, where it runs before every handler's own guards. Give it
`types: ['interaction']` in `@Guard` if it should skip messages, reactions and events.

**Error handling: exception filters.** A `try`/`catch` repeated in handlers to answer the user can move
into a `@Catch` filter, on the controller with `@UseFilter` or for the whole bot in
`@MeoCord({ filters })`.

**Cross-cutting work: interceptors.** Timing, logging and caching written into each handler can move into
an `@Interceptor`, which runs around the handler and sees what it returns or throws.

**Parsing options: `@Validate` and pipes.** Reading, checking and converting options inside the handler
can become a schema: the handler receives typed, valid values, and invalid input gets a private reply
listing each issue. A pipe turns a valid value into what the handler works with, such as a record loaded
by its id.

**Client events: `@On` and `@Once`.** A service that injected `Client` and called `client.on(...)` in its
constructor can declare `@On('guildMemberAdd')` on a method instead. The arguments are typed, the
handler runs through guards, interceptors and filters, and an error is logged rather than crashing the
bot. Tests send the event with `module.emit`.

**Startup and shutdown: lifecycle hooks.** Work started from a `ready` listener, or cleanup registered
with `process.on('SIGTERM')`, belongs in `onReady` and `onShutdown` from `OnReady` and `OnShutdown`.
They run in dependency order, and shutdown waits for them up to `shutdownTimeout`.

**Testing a handler: `invoke`.** Calling a controller method directly runs its guards only.
`module.invoke(Controller, 'method', interaction)` runs everything dispatch runs, global stages included
when the module is created with `app: App`, and resolves to `{ ran }`. `inspectHandler` lists the stages
a handler runs without building a module.

**Registration: the `commands` setting and `meocord register`.** A development bot can register every
command to one guild with `commands.developmentGuild`, where changes show at once, and a deployment can
register from CI with `meocord register` and `commands.register: false`. `@CommandBuilder(type, { guilds })`
keeps a staff command in its own guilds.

**Loading `.env`: the config only.** An `import 'dotenv/config'` at the top of `main.ts`, added so the
environment was set before `App` loaded, is no longer needed: the build loads `meocord.config.ts`, and
with it `.env`, ahead of `main.ts`. Keep the import in `meocord.config.ts` and remove the one in `main.ts`.

**Sharding: the `sharding` setting.** A hand-written discord.js `ShardingManager` script can become
`sharding: { shards: 'auto', mode: 'process' }` in `meocord.config.ts`, started as usual with
`meocord start` or `node dist/main.js`. Call a service in every shard with `ShardContext.call`.

**Localisation: `createTranslator`.** Command names, descriptions and replies kept in hand-rolled maps can
move into one typed catalog per locale, checked at compile time, with `expectCompleteCatalog` in tests.

**Optional packages: `optionalExternals`.** With `bundleDependencies`, a package a dependency only tries to
load, such as `supports-color`, belongs in `optionalExternals` rather than `externals`, where a missing
copy stopped the bot at startup.

---

Something here did not match what you saw? [Open an issue](https://github.com/l7aromeo/meocord/issues/new/choose).
