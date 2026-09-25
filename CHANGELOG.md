# meocord

## 4.1.0-beta.1

### Minor Changes

- [#120](https://github.com/meocord/meocord/pull/120) [`9d435d9`](https://github.com/meocord/meocord/commit/9d435d9da2bc62eab012ea2b80df2c1e001a926e) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `createMockMessage()` takes an `id`, `content`, `components`, `embeds` and `flags`, so a test can put controls on the message a button sits on, such as to check what `@Defer` locks; components and embeds may be API JSON, builders or discord.js instances.

### Patch Changes

- [#118](https://github.com/meocord/meocord/pull/118) [`5c636aa`](https://github.com/meocord/meocord/commit/5c636aa930224aef9b4670a5e16b234a3f57397d) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Tools that read the installed version with `require('meocord/package.json')` no longer fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

- [#121](https://github.com/meocord/meocord/pull/121) [`c6990c2`](https://github.com/meocord/meocord/commit/c6990c250f7694ca5adb9963e89f151b7ed5dc4b) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `inGuild()`, `inCachedGuild()` and `inRawGuild()` on a mock answer from its `guildId` and `guild`, so a mock created without a `guildId` is a DM and a guard that requires a guild returns `false`, not `undefined`.

## 4.1.0-beta.0

### Minor Changes

- [#66](https://github.com/meocord/meocord/pull/66) [`5b49d3e`](https://github.com/meocord/meocord/commit/5b49d3e2e827d4a3db88e3e554693957f1082ade) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Choose where commands are registered, and register without starting the bot.

  - `commands` in `meocord.config.ts`: `guilds` registers to guilds instead of globally, `developmentGuild` sends everything to one test guild under `start --dev`, `register: false` leaves registration to `meocord register`, and `clearOther` removes commands left in a scope no longer used, which are otherwise reported as a warning; a development run sending to `developmentGuild` only warns, since production may share the application.
  - `@CommandBuilder(type, { guilds })` keeps one command in its own guilds, for staff commands.
  - `meocord register [--build] [--dev] [--guild <id>]` registers over REST and exits, without logging in, and exits non-zero on failure.
  - In development, a scope whose commands are unchanged since the last start is not sent again; `meocord start --dev --force-register` sends it anyway.
  - Commands are read from the controllers' prototypes, so registering constructs no controller.

  With no `commands` setting, an existing bot still registers every command globally at each start. One thing does change: a builder whose `toJSON()` throws, such as a slash command missing its description, now stops that start's registration. You see an error naming the builder, and no commands are sent, where before the rest were registered and the broken one was dropped. A bulk update without it would delete it from Discord. Fix the builder and the next start registers everything.

  New applications get `developmentGuild` wired to `DEV_GUILD_ID` in `.env`.

- [#76](https://github.com/meocord/meocord/pull/76) [`6bfe0e3`](https://github.com/meocord/meocord/commit/6bfe0e3660664d834c23404c0dcac0477a469edb) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Limit how often a handler runs with `@Cooldown`.

  - `@Cooldown({ seconds, uses, per, bypass })` on an interaction or message handler, or a controller, allows `uses` calls within `seconds` (a sliding window), counted per `'user'`, `'guild'`, `'channel'` or `'global'`. Stack several for layered limits: each call counts against every one of them in order, so a call a later limit blocks has still used the earlier ones; put the shortest window first. `bypass` exempts callers such as owners. Counts are kept under the class name, so two same-named classes are refused at startup when either has a cooldown or a `@Once` handler.
  - It is counted after guards, validation and pipes, so a denied call or bad input spends nothing. A blocked call throws `CooldownError` (from `meocord/common`), which the built-in fallback answers only to the caller with `cooldownMessage()`: "Slow down: try again in 12s."
  - Calls are counted in memory by default. `@MeoCord({ cooldownStore })` takes a class extending `CooldownStore`, such as one on Redis, to share the count across shards and processes; with process sharding and the in-memory store, the bot warns that `'user'` and `'global'` cooldowns count per shard.
  - `inspectHandler(...).cooldowns` lists a handler's cooldowns.

- [#81](https://github.com/meocord/meocord/pull/81) [`017ec6c`](https://github.com/meocord/meocord/commit/017ec6cae7ac0510260e441bbef51bfe379f1ea9) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `@Defer()`, which acknowledges an interaction for its handler in two steps: a deferred reply (or an invisible deferred update, for a component) before guards run, so slow guards and handlers never miss Discord's three seconds; then, once guards, validation and pipes allow the call, a lock on the component's message — its controls disabled, the clicked button showing the loading emoji, the presenter's loading view added. `respond(interaction).send()` without `components` puts the message back as it was, including buttons that were disabled on purpose, and a handler that never answers has it put back when it returns. A guard that returns `false` leaves nothing behind, and one that throws `GuardDeniedError` is answered privately.

  Options: `ephemeral`, `disable` (`'all'`, `'clicked'` or `'none'`), `mode: 'auto'` to acknowledge only when the handler has not answered after `after` milliseconds (1500 by default, and never later than 2.5 seconds after the interaction was created), and `suppressNotifications`. `@Defer` on a message, reaction, event or autocomplete handler throws.

- [#69](https://github.com/meocord/meocord/pull/69) [`f00309f`](https://github.com/meocord/meocord/commit/f00309f6df7e0e42cd3a04c6ba8e7119889abfa2) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add exception filters, which decide what happens when a handler, its interceptors or its guards throw.

  - `@Catch(ErrorType, ...)` marks a class implementing `ExceptionFilter`: `catch(error, context)` receives the error and the call's `ExecutionContext`. With no types, it handles every error.
  - `@UseFilter(...)` applies filters to a method or a controller, and `@MeoCord({ filters })` to every handler. The method's filters are tried first, then the controller's, then global ones; within one level, the first whose `@Catch` matches. `{ provide, params }` passes options, read with `context.getParams()`. One instance serves every call.
  - An interaction no handler matches raises `CommandNotFoundError`, which global filters receive with no handler in the context.
  - `GuardDeniedError`, thrown from a guard, denies with a message the built-in fallback shows only to the user who made the call. Returning `false` still denies silently.
  - An error no filter handles goes to the built-in fallback, which logs it and answers the user: "An error occurred while executing the command.", or "Command not found!".
  - Testing: `overrideFilter(Class).useValue(stub)`, `inspectHandler(...).filters`, and `MeoCordTestingModule.create({ app })` includes global filters. `invoke` resolves with `error` set when a filter handled one, and rejects with an error no filter handles, since the fallback does not run in tests.
  - `meocord generate filter <name>` (alias `f`) writes a filter, the error it handles, and a spec.

- [#60](https://github.com/meocord/meocord/pull/60) [`f3ea0df`](https://github.com/meocord/meocord/commit/f3ea0df560d0deca8f6fc3b73b64b4abc56ca59d) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add typed handler metadata and `ExecutionContext`, so guards can read what they guard.

  - `createMetadata<T>(description)` in `meocord/common` makes a typed decorator for a controller or a handler, with a unique key.
  - `ExecutionContext` in `meocord/common` describes the handler call being run. A guard receives it by constructor injection and reads metadata with `context.get(Roles)`, where the handler's value wins over the controller's. It also gives the handler's arguments, the controller and method, the call type, and the guard's `{ provide, params }` through `getParams()`. `SetMetadata` keys are read with `context.get('roles')`.
  - `createExecutionContext(Controller, 'method', { args, params })` in `meocord/testing` builds that context for a guard's unit test.
  - `meocord generate guard` now generates a guard that reads a `createMetadata` decorator through `ExecutionContext`, with a spec using `createExecutionContext`.

  Existing guards and tests work unchanged: guards run in the same order, once each, whether a handler is dispatched or called directly in a test. A controller or service, which is shared across calls, cannot inject `ExecutionContext`; the bot and `MeoCordTestingModule` refuse to start with a clear error rather than handing one call's context to another.

- [#110](https://github.com/meocord/meocord/pull/110) [`5d45fc4`](https://github.com/meocord/meocord/commit/5d45fc4380baf8410beeaf62094f9090b4127507) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `isExplainedError(error)` in `meocord/common` tells whether MeoCord has already logged what went wrong with an error `app.start()` rejects with, and what to do about it, such as a privileged intent Discord refused. New apps' `main.ts` uses it to skip logging such an error a second time with its stack trace; an existing app can do the same:

  ```typescript
  bootstrap().catch(error => {
    if (!isExplainedError(error)) logger.error('Error during startup:', error)
  })
  ```

- [#68](https://github.com/meocord/meocord/pull/68) [`1eb5f7f`](https://github.com/meocord/meocord/commit/1eb5f7f067018b659f1dec0e3e69f8fd3632f1ad) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add gateway event handlers and handler discovery.

  - `@On(event)` and `@Once(event)` from `meocord/decorator` handle any discord.js client event on a controller or service, with the handler's parameters typed from `ClientEvents`. Event handlers run through the same pipeline as commands, so guards, interceptors and exception filters apply; an error no filter handles is logged with the event and handler, without stopping the bot. At startup MeoCord warns about intents and partials the handlers need that `clientOptions` lacks, for `@MessageHandler` and `@ReactionHandler` too.
  - `HandlerRegistry` from `meocord/core` lists every registered handler — commands (one entry per subcommand path), components, modals, autocomplete, message, reaction and event handlers — with the metadata declared on it. Inject it into a service to build a `/help` command or generated docs.
  - `TestingModule.emit(event, ...args)` sends an event to a testing module's handlers through the same pipeline, and `MeoCordTestingModule` binds `HandlerRegistry`.
  - A guard's `canActivate` now also receives an event handler's arguments, so its first parameter accepts any value, and `@UseGuard` no longer throws when a method's first argument is not an interaction, message or reaction.
  - Global guards and interceptors from `@MeoCord({ guards, interceptors })` also run on event handlers. `@Guard({ types })` and `@Interceptor({ types })` limit a guard or interceptor to the context types it is written for, at every level, and a subclass inherits them unless it declares its own. An empty list, or `'autocomplete'` for an interceptor, which never runs there, throws when the class is decorated. At startup MeoCord names each global one without `types` that will also run on events. With no stage that applies to a call, no execution context is built.

- [#65](https://github.com/meocord/meocord/pull/65) [`939e206`](https://github.com/meocord/meocord/commit/939e206660d9ad902a7571faeb145b80044e96b8) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add global guards: `@MeoCord({ guards })` runs guards before every dispatched handler — commands, components, modals, autocomplete, message and reaction handlers — ahead of the controller's and the method's own guards. Entries take the same forms as `@UseGuard`, a guard class or `{ provide, params }`, and guards that inject `ExecutionContext` receive it. A controller method called directly still runs only its own guards.

  For tests, `MeoCordTestingModule.create({ app: App, ... })` reads the application's global guards, so `module.invoke` runs them first, and `inspectHandler(Controller, 'method', { app: App })` lists them first. Controllers and providers are still listed as before.

- [#78](https://github.com/meocord/meocord/pull/78) [`99a8bd4`](https://github.com/meocord/meocord/commit/99a8bd4f953e7dc54dd4d385afe66db8085dfb79) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `respond(interaction)`, one place to answer an interaction, and presenters to style MeoCord's answers.

  - `respond(interaction)` in `meocord/common` returns the interaction's response state, typed as the `ResponseState` interface: `acknowledge()`, `send()`, `edit()`, `followUp()`, `delete()`, `modal()` and `error()`. Each picks the Discord call from where the answer stands — reply, update or edit — re-read from the interaction on every call, so answers made directly with discord.js still count. Flags are computed per call, so an ephemeral follow-up never leaks into the next message, and one sent while a public deferred reply is still empty stays private instead of becoming that reply; Components V2 edits keep their flag; re-sent Discord attachment images are pointed at `attachment://`.
  - Answers go through the interaction's own methods, which work wherever a user-installed app is used. The channel is used only once the interaction's token has expired and the bot is present. `getInstallContext(interaction)` in `meocord/common` reports where an interaction happened and whether the bot is there.
  - `error(error, { message, visibility })` shows an error and never throws. The built-in fallback now answers through it, so an error on a private (ephemeral) component message is added to that message rather than sent separately.
  - `@MeoCord({ presenter })` takes a `ResponsePresenter` that styles the error and loading views. Without one, errors look as before, and the loading view is "⏳ Working on it…" in the new `Theme.primaryColor`.
  - Interceptors and filters reach the state as `context.response`.
  - Testing: `getResponse(interaction)` reports what `respond()` sent; `createDiscordError(code)` builds the error discord.js throws; mock messages carry real, empty `flags`, `components`, `embeds` and `attachments`; mock `showModal()` and a modal submission's `deferUpdate()` answer the interaction as the real ones do.

- [#67](https://github.com/meocord/meocord/pull/67) [`6c47f09`](https://github.com/meocord/meocord/commit/6c47f0924c278277985c045bdca9e301bc7f5420) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add interceptors, which run around a handler once its guards allow the call — for timing, logging, caching or mapping errors.

  - `@Interceptor()` marks a class implementing `InterceptorInterface`: `intercept(context, next)` receives the call's `ExecutionContext` and continues with `next.handle()`, which resolves to what the handler returns. An interceptor can act before and after the handler, skip it, or replace the error it throws.
  - `@UseInterceptor(...)` applies interceptors to a method or a controller, including inherited handlers, and `@MeoCord({ interceptors })` to every handler. Global interceptors are outermost, then the controller's, then the method's. `{ provide, params }` passes options, read with `context.getParams()`.
  - One instance serves every call. An interceptor that injects `ExecutionContext` is refused at startup.
  - Interceptors run for dispatched handlers and under `TestingModule.invoke`; a controller method called directly runs its guards but no interceptors, and autocomplete handlers run none.
  - Testing: `overrideInterceptor(Class).useValue(stub)`, `inspectHandler(...).interceptors`, and `MeoCordTestingModule.create({ app })` includes global interceptors. `invoke` resolves `{ ran: false }` when an interceptor skips the handler.
  - `meocord generate interceptor <name>` (alias `i`) writes an interceptor and its spec.

- [#64](https://github.com/meocord/meocord/pull/64) [`37170f3`](https://github.com/meocord/meocord/commit/37170f3abea1c148acfe0891828abb8743f68c0d) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add lifecycle hooks. A controller or service that implements `OnReady` from `meocord/interface` has `onReady(client, { primary })` called once the bot is ready; one that implements `OnShutdown` has `onShutdown()` called on SIGINT or SIGTERM, before the client is destroyed. Hooks run on every controller and service the app binds, including services no handler has used yet. `onReady` hooks run one at a time in dependency order, each class after the classes it injects, and never wait for command registration; `onShutdown` hooks run in reverse order. A hook that throws is logged and the next one still runs. A signal that arrives while `onReady` hooks are running starts no further `onReady` and shuts down only the classes whose `onReady` finished, and those without one. Shutdown waits for the `onShutdown` hooks up to the new `shutdownTimeout` option in `meocord.config.ts` (10 seconds by default), then destroys the client and exits 0.

  A process now adds one SIGINT and one SIGTERM listener however many apps it starts, so a test suite that creates many apps no longer triggers Node's `MaxListenersExceededWarning`.

- [#73](https://github.com/meocord/meocord/pull/73) [`42b62a1`](https://github.com/meocord/meocord/commit/42b62a19947daccef86930bf769880025a626b29) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Translate commands and replies from typed catalogs.

  - `createTranslator({ default, locales })` in `meocord/common` builds a translator from one catalog per discord.js `Locale`. Keys, `{name}` params and plural forms (`{ one, other, … }`, chosen through `Intl.PluralRules`) are type-checked against the default catalog, which `defineCatalog(...)` or `as const` keeps literal; other locales may leave messages out, and fall back to a locale of the same language, then the default.
  - `t.default(key)` and `t.localizations(key)` fill command builders; `t.for(interaction)`, `t.for(interaction, { public: true })`, `t.forGuild(guild)` and `t.locale(locale)` translate replies.
  - `@MeoCord({ i18n: t })` injects it as `Translator`.
  - `expectCompleteCatalog` in `meocord/testing` reports missing messages and plural forms per locale.
  - Registration refuses localised names and descriptions Discord would reject, listing each field, and a builder that throws while building now names itself and the command.

  Nothing changes for a bot that does not use it.

- [#84](https://github.com/meocord/meocord/pull/84) [`b21b0ed`](https://github.com/meocord/meocord/commit/b21b0ed11c102ac5cc01b86aa90fbb4f035c1323) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `createMockInteraction` accepts `authorizingIntegrationOwners` as the plain map Discord sends — `{ [ApplicationIntegrationType.UserInstall]: userId }` — and builds the `AuthorizingIntegrationOwners` object discord.js would, so testing a user-installed command no longer needs `as never`.

- [#75](https://github.com/meocord/meocord/pull/75) [`b11d77b`](https://github.com/meocord/meocord/commit/b11d77b0e92fe819725fb387d3f27d35581f11cc) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `optionalExternals` to `meocord.config.ts`, for packages a dependency tries to load and runs without, such as `supports-color`, which `debug` probes for inside a `try` and which axios brings in. With `bundleDependencies` on, such a package made every build warn, and listing it in `externals` made the bot fail at startup when it was missing, because an external becomes an import that runs before the bot's code. A name listed in `optionalExternals` stays a `require` where the dependency calls it, so a missing package is caught by the dependency, and it is copied into `dist/node_modules` when it is installed. The build warns when a name is also in `externals`. discord.js's optional accelerators, `zlib-sync`, `bufferutil` and `utf-8-validate`, are handled the same way, as before.

- [#72](https://github.com/meocord/meocord/pull/72) [`d9ad59b`](https://github.com/meocord/meocord/commit/d9ad59b3972d7671a58b008efc67f666d57f7a79) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add sharding, configured by `sharding` in `meocord.config.ts`.

  - `sharding: { shards: 'auto' }` (or a number) runs every shard in one process, in one client, with nothing else changing. Unset, `clientOptions.shards` works as before.
  - `mode: 'process'` runs each shard in its own process. `meocord start`, `node dist/main.js`, bun and process managers such as pm2 all start a manager that registers the commands once, spawns the shards from the built bundle, restarts a shard that exits with a growing delay, stops everything with exit code 1 when a shard's token is invalid or Discord refuses its intents, and on SIGINT or SIGTERM shuts every shard down through its `onShutdown` hooks before killing any left after `shutdownTimeout` plus five seconds. Under `meocord start --dev` every shard runs in one process unless `sharding.development` is `true`.
  - `ShardContext` from `meocord/core` gives the shards of the current process and calls a service method in every shard with `call(Service, 'method', ...args)`, one result per process. Each process runs the class passed in, or, for a call from another process, the class of that name, so with process sharding the bot refuses to start when two controllers or services share a name. `onReady`'s `primary` is `true` only in the process running shard 0.
  - `MeoCordFactory.create()` now returns the new `MeoCordApplication` type, with the same `start()` and `registerCommands()` as before.
  - The generated `meocord.config.ts` shows the `sharding` option, commented out.

- [#63](https://github.com/meocord/meocord/pull/63) [`9e27912`](https://github.com/meocord/meocord/commit/9e27912fc8f026fc3f532eddefcc8fd144712610) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `TestingModule.invoke` and `inspectHandler` to `meocord/testing`, for testing a handler the way the bot runs it.

  - `module.invoke(Controller, 'method', ...args)` runs the handler through the same pipeline dispatch uses, starting with its guards, class guards first and each once. Guards resolve from the testing module, so `overrideGuard` stubs apply and guards that inject `ExecutionContext` receive it. It resolves to `{ ran }`, `false` when a guard denied the call, and the method name and arguments are type-checked against the handler. An interaction dispatch could not route to the handler, such as a customId its pattern does not match, is rejected before anything runs.
  - `inspectHandler(Controller, 'method')` reports the guards that run for a handler, in order, and reads its metadata as `ExecutionContext` does, without building a module.

  Calling a controller method directly in a test still runs its guards, as before.

- [#70](https://github.com/meocord/meocord/pull/70) [`ade2be6`](https://github.com/meocord/meocord/commit/ade2be6a1dcb953f89d7f3954833540485bd2192) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Validate a handler's input, and transform it with pipes.

  - `@Validate(schema)` checks an interaction handler's input with any [Standard Schema](https://standardschema.dev) library (zod, valibot, arktype and others) before it runs; a handler takes one, and a second throws when decorated. The handler receives the schema's output, and its second parameter is type-checked against it. Invalid input throws a `ValidationError` (from `meocord/common`) listing each issue, which the built-in fallback answers privately with that list; an exception filter can phrase it otherwise.
  - Pipes turn one validated value into what the handler works with: `@Validate(schema, { pipes: { uid: AccountPipe } })` keeps the handler fully typed, and `@UsePipe(key, ...pipes)` works on its own or beside `@Validate`, where the value it produces is marked `Piped<T>` (from `meocord/interface`). Mark a class `@Pipe()` and implement `PipeInterface`.
  - `meocord generate pipe <name>` (alias `pi`) writes a pipe and its spec.
  - A modal handler's second argument now also carries the submitted fields, keyed by customId, next to the customId params; a param wins over a field of the same name, with a warning in development.
  - `TestingModule.invoke` builds the params from the interaction when a test passes none, and `createModalFields` gives a mock modal its fields.

  Existing handlers keep working: modal handlers receive extra keys, and nothing is validated until you add `@Validate`.

### Patch Changes

- [#65](https://github.com/meocord/meocord/pull/65) [`5df8fa3`](https://github.com/meocord/meocord/commit/5df8fa3d019af0eb2514602cd26c3fec5aa378cd) Thanks [@l7aromeo](https://github.com/l7aromeo)! - A class-level `@UseGuard` now also guards the controller's `@Autocomplete` handlers, including inherited ones, as it does commands, components, message and reaction handlers. Global guards from `@MeoCord({ guards })` run there too. A guard sees an `AutocompleteInteraction` and `ExecutionContext.getType() === 'autocomplete'`, and must not reply; when a guard denies, the menu is closed with an empty list instead of being left loading.

  This changes which guards run for autocomplete. If a class guard assumes a command interaction or replies on denial, see [Class guards now cover autocomplete handlers](https://github.com/meocord/meocord/blob/main/docs/MIGRATING.md#class-guards-now-cover-autocomplete-handlers).

- [#80](https://github.com/meocord/meocord/pull/80) [`cc2fb29`](https://github.com/meocord/meocord/commit/cc2fb2923cd46cb9f44c7ebdc108bfa66d357716) Thanks [@l7aromeo](https://github.com/l7aromeo)! - The CLI stops sooner and says what to do when something is wrong.

  - `build`, `start` and `register` check `meocord.config.ts` first. One that fails to load stops them, naming the file and line, instead of building on. Options of the wrong type, such as `sharding.mode: 'bogus'` or `optionalExternals: 'sharp'`, stop them with a list of every problem, where before some built silently and others failed with an internal error. An option MeoCord does not know is reported as a warning. `start --prod` without `--build` checks the built config the same way, and says when there is no config at all.
  - The compiled config is written only once it has built, so a failed build no longer leaves a broken `dist/meocord.config.mjs` for every later command to trip over.
  - `meocord generate` refuses names that leave its folder (`..`, a leading `/`, a drive letter), which could write outside `src/` or the project, and asks to be run from a project's root. On Windows, `\` separates folders in a name.
  - `meocord create` refuses a name with no letters or digits, which was reported as `Directory "" already exists`.
  - A missing token is reported with where it comes from: `discordToken` in `meocord.config.ts`, which a new app reads from `DISCORD_TOKEN` in `.env`.
  - `start --dev --build` builds once, as the watcher does, instead of twice.

- [#95](https://github.com/meocord/meocord/pull/95) [`86301f7`](https://github.com/meocord/meocord/commit/86301f7bce5ec2529e7271bb8e808c88fee29485) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `meocord start --dev` restarts the bot on the next rebuild after it exited on its own, such as after an error at startup, and Ctrl+C then stops the watcher at once instead of waiting for a second Ctrl+C. The bot started through `npm run` from a script bun runs is launched on node again, rather than handed to npm.

- [#105](https://github.com/meocord/meocord/pull/105) [`8dc19f4`](https://github.com/meocord/meocord/commit/8dc19f49fea3c896de35918c7be5a8ac09f2ac6f) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `meocord --help` and each command's help no longer print "No available choices." for arguments that have no choices, and `meocord create --help` describes its `<app-name>` argument instead of saying "No description provided".

- [#103](https://github.com/meocord/meocord/pull/103) [`35d2276`](https://github.com/meocord/meocord/commit/35d22764a5b011c29f1e0fa5b927cf674d23f6c6) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `meocord start` and `meocord register` pass SIGINT and SIGTERM on to the bot. A signal sent to the CLI alone, as Docker, pm2 and systemd send one, used to stop the CLI and leave the bot running, or, with SIGINT, not stop it at all; the bot now shuts down through its own shutdown path and the CLI exits with its code. One Ctrl+C that reaches a process twice within a second counts once, so it no longer force-kills the shards in process sharding; a second signal after that still stops everything at once.

- [#93](https://github.com/meocord/meocord/pull/93) [`18db29e`](https://github.com/meocord/meocord/commit/18db29ece8640bff65daf7a58d288d76f03ce9ff) Thanks [@l7aromeo](https://github.com/l7aromeo)! - The warning about two component `customId` patterns that can match the same id, such as `a/{x}/c` and `a/b/{y}`, is logged when the bot starts, as the README describes, rather than at the first button, select menu or modal interaction. The routes are built once at startup and reused by every interaction.

- [#69](https://github.com/meocord/meocord/pull/69) [`f00309f`](https://github.com/meocord/meocord/commit/f00309f6df7e0e42cd3a04c6ba8e7119889abfa2) Thanks [@l7aromeo](https://github.com/l7aromeo)! - A command that throws after deferring its reply is now answered instead of left showing "thinking…" until it times out: the deferred reply is edited into the error message. A command or component that throws after it already replied now gets a private follow-up with the error, where it used to get nothing. Buttons, select menus and modals submitted from a public message are answered with a private follow-up, never by editing the message the user clicked; on a private (ephemeral) message, the error is added to that message. Unanswered interactions are answered exactly as before.

  If you want a different answer in these cases — a different text, no answer, or a log to an error service — register an exception filter with `@Catch()` in `@MeoCord({ filters })`: filters run before this built-in answer and replace it.

- [#56](https://github.com/meocord/meocord/pull/56) [`c2c09d7`](https://github.com/meocord/meocord/commit/c2c09d7b703408b2813f6088c2f09e9dc4bad20c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Update `@rsbuild/core` to 2.2.9, and generate new applications with `prettier` 3.9.9.

- [#59](https://github.com/meocord/meocord/pull/59) [`7cfea8d`](https://github.com/meocord/meocord/commit/7cfea8d383680e30e1d80d62c6a14e337563c897) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `meocord/eslint` ignores `coverage/`. Flat config does not read `.gitignore`, so running `eslint` after `test:coverage` in a generated application linted the istanbul report and failed with three warnings about unused `eslint-disable` directives. Nothing to do after upgrading.

- [#110](https://github.com/meocord/meocord/pull/110) [`213bd8b`](https://github.com/meocord/meocord/commit/213bd8bdc555777d840b20ec74fb603dfe05eca4) Thanks [@l7aromeo](https://github.com/l7aromeo)! - When Discord refuses a privileged intent at login, the bot now says which privileged intents it requests (`GuildMembers`, `GuildPresences`, `MessageContent`) and where to enable them — Developer Portal → your application → Bot → Privileged Gateway Intents — and that a verified bot in 100 or more servers needs Discord's approval for them. Before, it printed only "Used disallowed intents" and a stack trace. Intents Discord refuses as invalid are explained too. The stack trace moves to debug level; the exit code and the error `app.start()` rejects with are unchanged.

- [#59](https://github.com/meocord/meocord/pull/59) [`d4612b3`](https://github.com/meocord/meocord/commit/d4612b31817ca35292b2290804e60882ca10d312) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Generated controllers, context menu builders and services pass the application's lint as written. `meocord g` output carried a blank line at the start of each controller class, a split context menu builder chain and a semicolon in the service, which failed prettier whenever `eslint --fix` had not already rewritten the file. Files you generated earlier are unaffected; `eslint --fix` corrects them.

- [#58](https://github.com/meocord/meocord/pull/58) [`88cb6f0`](https://github.com/meocord/meocord/commit/88cb6f0916628f3a6915a44908c5fec299df3629) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Fix handlers of a controller that extends another controller being added to the parent class too. A subclass's `@Command`, `@MessageHandler`, `@ReactionHandler` and `@Autocomplete` handlers were written into the base class's metadata, so the base controller listed, and could be routed to, handlers it does not have. Each class now keeps its own copy, including the handlers it inherits.

  Fix the guard list stored under `MetadataKey.Guards` when `@UseGuard` is used on both a class and its methods. The class-level list replaced the method's own guards; it now holds every guard that runs, class-level guards first, in the order they run. Which guards run is unchanged.

- [#109](https://github.com/meocord/meocord/pull/109) [`2d4738a`](https://github.com/meocord/meocord/commit/2d4738ae09798732616ea7f356a148fe23dc7eda) Thanks [@l7aromeo](https://github.com/l7aromeo)! - A handler may take fewer parameters than dispatch passes, as any TypeScript callback can. `@Command`, `@Autocomplete`, `@MessageHandler` and `@ReactionHandler` on a method with no parameters, such as `async refresh() {}`, failed to compile with TS1241 ("Unable to resolve signature of method decorator"), and `@Validate` or `@UsePipe` on a handler that ignores its input was refused as a mismatch. Both now compile. A parameter of the wrong type is still refused.

- [#65](https://github.com/meocord/meocord/pull/65) [`53eac95`](https://github.com/meocord/meocord/commit/53eac95ee9f637cb644f950527eedc17ef1e0fe5) Thanks [@l7aromeo](https://github.com/l7aromeo)! - A class-level `@UseGuard` now also guards the handlers a controller inherits. On a controller that extends another, the subclass's guards were applied only to the handlers it declared itself, so inherited commands, components, message and reaction handlers ran without them. They now run the subclass's guards first, then the base class's, then the method's, whether dispatched, called directly or run with `TestingModule.invoke`.

  This changes which guards run for inherited handlers. If your bot relied on an inherited handler skipping the subclass's guards, see [Class guards now cover inherited handlers](https://github.com/meocord/meocord/blob/main/docs/MIGRATING.md#class-guards-now-cover-inherited-handlers).

- [#64](https://github.com/meocord/meocord/pull/64) [`a42ca18`](https://github.com/meocord/meocord/commit/a42ca18332f843408dce6ac373b738f7e1af4961) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Fix `MeoCordFactory.create()` for a controller or service that injects a dependency with `@inject(Token)` on a parameter typed as an interface. The factory followed only the parameter's type, which for an interface is `Object`, so it bound `Object` instead of the token and resolving the class failed with "missing metadata on type Object". It now binds the `@inject` token, and skips built-in constructors such as `Object`.

- [#62](https://github.com/meocord/meocord/pull/62) [`04c7333`](https://github.com/meocord/meocord/commit/04c7333ccb608afa425db93a0bfb7b6beb58f217) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `process.env` values loaded by `meocord.config.ts` are set before the application's modules run. `main.ts` imports `App` before anything else, so an option such as `@MeoCord({ activities: [{ name: process.env.STATUS! }] })` read the environment before the config's `dotenv` import had loaded `.env`, and got `undefined`. The build now loads `dist/meocord.config.mjs` ahead of `main.ts`, for every way of starting the bundle. Rebuild to pick it up; no code changes. The README shows how to choose a `.env` file per environment.

- [#69](https://github.com/meocord/meocord/pull/69) [`baa94ed`](https://github.com/meocord/meocord/commit/baa94ed1819fbc7d5ea5a179af7220d614226766) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `createMockInteraction(ModalSubmitInteraction)` now runs the real `isFromMessage()`, so it returns `true` only when the mock has a `message`, as a real modal does. It returned `undefined`.

- [#113](https://github.com/meocord/meocord/pull/113) [`9b54a71`](https://github.com/meocord/meocord/commit/9b54a71a0ee0fe42181fc18ef03ff03b2ed1dd28) Thanks [@l7aromeo](https://github.com/l7aromeo)! - MeoCord's repository is now `meocord/meocord` on GitHub. The package's repository, homepage and issue links point there, and so does the README that `meocord create` writes for a new application. Links to the old `l7aromeo/meocord` address redirect, so nothing needs changing in your code or bookmarks.

- [#61](https://github.com/meocord/meocord/pull/61) [`1f09800`](https://github.com/meocord/meocord/commit/1f098002964d21e3d5c367188cc8403d8dcd8a43) Thanks [@l7aromeo](https://github.com/l7aromeo)! - The `RateLimitGuard` that 4.0 copied into generated applications never limited anything: a new guard instance is created for every call, so the counts it kept on the instance started empty each time. New applications no longer get it; they limit their sample commands with `@Cooldown`.

  Upgrading `meocord` does not change the copy in your application. If your app still has `src/guards/rate-limit.guard.ts`, move its `rateLimits` map out of the class to module level, so every instance shares it, or replace the guard with `@Cooldown({ uses, seconds })`.

  The README now explains that a guard instance is created for every call, and shows how to pass options to a guard with `@UseGuard({ provide, params })`.

- [#84](https://github.com/meocord/meocord/pull/84) [`ed07729`](https://github.com/meocord/meocord/commit/ed07729ef2ca4b9b26583c9630a32b601b2b79f6) Thanks [@l7aromeo](https://github.com/l7aromeo)! - New applications from `meocord create` start with the 4.1 patterns. Existing applications are not changed: upgrading `meocord` never touches your code.

  - The sample controllers answer through `respond(interaction)`. The button, select menu and modal samples use `@Defer`, and the button sample's second handler is guarded by an `OwnerGuard` that denies with `GuardDeniedError`.
  - The slash, button, modal and context menu samples limit how often they run with `@Cooldown({ uses: 5, seconds: 60 })`, and the `RateLimitGuard` and its spec are gone.
  - `src/presenters/app.presenter.ts` styles the loading and error views, registered with `@MeoCord({ presenter })`.
  - Each sample's spec runs its handler with `invoke` and checks what `respond()` sent.

- [#88](https://github.com/meocord/meocord/pull/88) [`53517cc`](https://github.com/meocord/meocord/commit/53517cce6384d6f718f4831ab67d2cb7f49f1f40) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `SetMetadata` refuses the keys MeoCord stores its own metadata under, such as `'guards'` and `'commandType'`, and throws when the decorator is created, naming the key. A value under `'guards'` replaced the guard list dispatch runs, so a handler decorated with `@SetMetadata('guards', …)` above its `@UseGuard` ran with none of its guards. Choose another key, or declare the decorator with `createMetadata`, whose key is unique; see [`SetMetadata` refuses MeoCord's own keys](https://github.com/meocord/meocord/blob/main/docs/MIGRATING.md#setmetadata-refuses-meocords-own-keys).

  A guard class listed in `@MeoCord({ services })` is warned about at startup: one shared instance takes every call's `{ provide, params }`.

- [#107](https://github.com/meocord/meocord/pull/107) [`aca4436`](https://github.com/meocord/meocord/commit/aca4436aba0c4400ca9f95aa78f428999f6283bd) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `@UseGuard`, `@UseInterceptor`, `@UseFilter`, `@UsePipe`, `@Validate`'s pipes and `@MeoCord({ guards, interceptors, filters })` all take the same entries: a class, or `{ provide: Class, params? }`. `params` is now optional for guards, interceptors and filters too, as it already was for pipes, so `{ provide: ChannelGuard }` works as the class alone; before, a guard or interceptor given that way failed inside the container on its first call.

  Anything else, such as `null`, a `provide` that is not a class, or `params` that are not an object, is refused when the decorator applies, with an error naming the decorator and the class or handler, instead of failing when a call first reaches it.

- [#65](https://github.com/meocord/meocord/pull/65) [`1c4ed6f`](https://github.com/meocord/meocord/commit/1c4ed6f2671f9932c8940f560d0a4f01c51ec8b8) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Fix dependency injection for a controller, service or guard that extends another decorated class. The subclass was treated as already set up because its base class was, so its own constructor's dependencies were never injected: a subclass with its own constructor failed to resolve, and one without a constructor was built with no arguments. A subclass now gets its own constructor's dependencies, or its base class's when it declares no constructor, and inherits its base class's injected properties. No change is needed in your code.

- [#92](https://github.com/meocord/meocord/pull/92) [`a531fcb`](https://github.com/meocord/meocord/commit/a531fcbc7bafb2f4a88d329ce5cec0efd358a722) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Fix building an application whose `tsconfig.json` uses `extends`, `files`, or `compilerOptions.typeRoots`. MeoCord builds from a copy of `tsconfig.json` in a temporary directory, and a relative `extends` or `files` entry in that copy pointed at files that are not there; a package in `extends`, such as `@tsconfig/node22/tsconfig.json`, could not be found from there either. The copy now carries absolute paths, with a package resolved from the project's `node_modules`. `typeRoots` is read from `compilerOptions`, where TypeScript declares it, and `include` and `exclude` are resolved even without `compilerOptions`.

- [#92](https://github.com/meocord/meocord/pull/92) [`16d9a59`](https://github.com/meocord/meocord/commit/16d9a59d47ca85b47a608498e8b01174342d7772) Thanks [@l7aromeo](https://github.com/l7aromeo)! - `meocord build` no longer rewrites your `tsconfig.json`. When the file had comments or trailing commas, which TypeScript allows, the build "repaired" it and wrote the result back, deleting your comments, and the repair broke on a `//` inside a string such as `"$schema": "https://json.schemastore.org/tsconfig"`, failing the build. MeoCord now reads comments and trailing commas as TypeScript does, leaves strings alone, and only ever writes its own temporary copy. A `tsconfig.json` it cannot parse fails the build with the file and the fix named.

- [#74](https://github.com/meocord/meocord/pull/74) [`5f32513`](https://github.com/meocord/meocord/commit/5f32513e508e37679e3cb5d9762527f107ad3572) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Fix builds that run at the same time, such as CI jobs sharing a runner, failing with a JSON parse error in `modified-tsconfig.json`. Every build wrote its copy of the tsconfig to one fixed file in the system temp directory, so two builds could read each other's half-written file. Each build now writes to a directory of its own, removed when the build exits.

## 4.0.0

MeoCord 4 builds with Rsbuild instead of webpack, requires Node.js 22.13 and dotenv 18, and can
deploy a bot without `node_modules`. Most bots need two changes; see the
[migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md).

### Major Changes

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Build with [Rsbuild](https://rsbuild.rs) instead of webpack. Production builds are several times
  faster, and webpack and its four loader and plugin packages are no longer installed with MeoCord.
  The output layout is unchanged: `dist/main.js`, and assets under `dist/assets/` with the same names.
  Production source maps now list sources as `../src/...` paths instead of `webpack://` URLs.

  **Breaking:** the `webpack` hook in `meocord.config.ts` is replaced by `rsbuild`, which receives
  Rsbuild's configuration. A config that still declares `webpack` stops the build with a message
  saying so. `MeoCordWebpackConfig` is removed; import `RsbuildConfig` from `meocord/interface`
  instead. The [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#2-replace-the-webpack-hook-with-rsbuild) shows where each
  webpack setting goes.

- [#44](https://github.com/l7aromeo/meocord/pull/44) [`e48472e`](https://github.com/l7aromeo/meocord/commit/e48472e9ffee2f0371a7a2a71a4063e99ce61674) Thanks [@l7aromeo](https://github.com/l7aromeo)! - **Breaking:** `meocord/decorator` exports only the decorators. The routing helpers it also exported
  — `getCommandMap`, `getMessageHandlers`, `getReactionHandlers`, `getAutocompleteHandlers`,
  `findAmbiguousRoutes` and `PARAM_SEPARATOR` — are internal to MeoCord now. See the
  [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#internal-helpers-are-no-longer-exported).

- [#19](https://github.com/l7aromeo/meocord/pull/19) [`204c7be`](https://github.com/l7aromeo/meocord/commit/204c7bec74886c931732cb771d9178b47fbec5e8) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Require dotenv 18. The `dotenv` peer dependency moves from `^17.4.2` to `^18.0.3`, so install
  `dotenv@18` alongside MeoCord 4. No application code changes — `import 'dotenv/config'` behaves
  the same. See the [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#1-upgrade-dotenv-to-18).

- [#33](https://github.com/l7aromeo/meocord/pull/33) [`21b06ae`](https://github.com/l7aromeo/meocord/commit/21b06ae6810cfe203abadcadc6f7b7247c7b305b) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Require Node.js 22.13 or newer, up from 22.0. A built bot loads its compiled config with `require()`
  of an ES module. Node 22.12 runs that without a flag but still warns on every start and crashes on a
  config that throws; 22.13 is the first 22 release that does neither. Bun is unaffected. See the
  [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#before-you-start-nodejs-2213).

- [#36](https://github.com/l7aromeo/meocord/pull/36) [`45e564e`](https://github.com/l7aromeo/meocord/commit/45e564e6baff17313037372ec56baa1711a3584c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - **Breaking:** `app.start()` rejects when the login fails. It logged the error and resolved, so a bot
  with an invalid token went on to log "Application started" and exit with code 0, which Docker's
  `restart: on-failure`, systemd and CI all read as success. It now sets the exit code to 1 before
  rejecting, so a bot that fails to log in exits 1 with its entry point unchanged. See the
  [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#4-build-and-start).

### Minor Changes

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `bundleDependencies`, which puts everything a bot needs inside `dist`, so it deploys without
  `node_modules` or an install step. Plain JavaScript dependencies are bundled into `main.js`. Native
  addons such as `sharp` are found while building and copied, with their platform binary, into
  `dist/node_modules` — nothing has to be listed. Only binaries for the platform building are copied,
  whichever package manager installed them.

  A build carrying native addons records its platform in `dist/meocord.platform.json`, and a bot
  started on another platform stops before going online with a message naming both. Build on the
  platform you deploy to. See
  [Self-contained builds](https://github.com/l7aromeo/meocord#self-contained-builds).

- [#47](https://github.com/l7aromeo/meocord/pull/47) [`9652436`](https://github.com/l7aromeo/meocord/commit/965243660323277827a64851f28da9cda2c2fe0c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `resolveRoute` and `findRouteConflicts` to `meocord/testing`, for testing which handler a
  component's customId reaches. `resolveRoute(App, { type, customId })` gives the answer dispatch
  gives — across every controller the app registers, for that component type, most specific pattern
  first — as the controller, the handler method and its name, and the captured params, or `undefined`.
  `findRouteConflicts(App)` returns the pattern pairs that can match the same customId, which MeoCord
  otherwise only warns about at startup. Both read decorator metadata only, and dispatch runs on the
  same matcher.

### Patch Changes

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Read `meocord.config.ts` on every build. `meocord build` read the compiled `dist/meocord.config.mjs`
  left by the previous build, so a config edit took effect one build late, and the watcher's reload
  on a config change reloaded nothing.

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Start the bot with `bun --no-install` from `meocord start`. Without it, bun downloads any package it
  cannot find while the bot runs, which a bot deployed without `node_modules` would do in
  production. If you start `dist/main.js` with bun yourself, pass the flag too.

- [#37](https://github.com/l7aromeo/meocord/pull/37) [`a9452c2`](https://github.com/l7aromeo/meocord/commit/a9452c256beace70141bb87ed33c693d14064d14) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Type the CommonJS build as CommonJS. Every entry point's `require` condition resolved to the ESM
  declarations, so a CommonJS TypeScript project was told `meocord/core` is an ES module it cannot
  `require`, even with `skipLibCheck`. Each entry now ships `.d.cts` declarations for `require`, and
  `meocord/eslint` types its `module.exports` array as what `require` returns.

- [#33](https://github.com/l7aromeo/meocord/pull/33) [`21b06ae`](https://github.com/l7aromeo/meocord/commit/21b06ae6810cfe203abadcadc6f7b7247c7b305b) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Load the compiled config without a transpiler. A built bot reads `dist/meocord.config.mjs` with
  `require()` and no longer falls back to `meocord.config.ts` when it is missing, so jiti stays out of
  a bot bundled with `bundleDependencies`. `meocord build` fails when the config does not compile,
  instead of warning and producing a bot that cannot start.

- [#35](https://github.com/l7aromeo/meocord/pull/35) [`b93a771`](https://github.com/l7aromeo/meocord/commit/b93a771b19664345fec4222d5a2c29dcf5b31a0d) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Generate code that passes a new application's own `lint`. A generated guard failed `tsc` and ESLint
  — `GuardInterface` imported as a value, and an unused `context` parameter — and generated message and
  reaction controllers imported names they never used, which only the application's ESLint, run in the
  background after generating, removed. New applications also typecheck `meocord.config.ts`: the
  template's `tsconfig.json` includes it instead of excluding it, so a type error in the config fails
  `lint`, and editors resolve `paths` aliases imported there. `noEmit` stays on, so `tsc` writes nothing
  beside it.

- [#25](https://github.com/l7aromeo/meocord/pull/25) [`2179f85`](https://github.com/l7aromeo/meocord/commit/2179f85c2912d45e3fefbf996ca267c19a1a773c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Stop `meocord generate` overwriting files. Slash, context-menu and primary entry point controllers
  all wrote one shared `builders/sample.builder.ts`, so generating a second controller replaced a
  builder you had already edited. Each controller now gets its own `builders/<name>.builder.ts`
  exporting `<Name>CommandBuilder`, and registers a command named after it — `admin/ban` registers
  `admin-ban` — rather than every one registering `sample-slash`. Generating a controller, service or
  guard refuses if any file it would write already exists.

- [#40](https://github.com/l7aromeo/meocord/pull/40) [`3629edd`](https://github.com/l7aromeo/meocord/commit/3629eddaf20bd0947d24e5582aa167b2c0ca0d47) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Lint `meocord.config.ts`. The shared ESLint config from `meocord/eslint` ignored it, so the config
  alone skipped the rules every other file follows — unused imports, formatting. It is linted like the
  rest now; the typecheck it already gets is unchanged.

- [#24](https://github.com/l7aromeo/meocord/pull/24) [`5e2a54b`](https://github.com/l7aromeo/meocord/commit/5e2a54b67a1f9f51c4c3a3e8cf51247de2ac2528) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Type `deleted` on `createMockMessage()`. The mock tracks and documents it, but it was missing from
  the type, so `message.deleted` did not compile.

- [#24](https://github.com/l7aromeo/meocord/pull/24) [`5e2a54b`](https://github.com/l7aromeo/meocord/commit/5e2a54b67a1f9f51c4c3a3e8cf51247de2ac2528) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Accept slash command builders that add options. `@CommandBuilder(CommandType.SLASH)` rejected
  `new SlashCommandBuilder().addStringOption(...)`, whose type narrows to
  `SlashCommandOptionsOnlyBuilder`, so the most common builder — one command with an option — did
  not compile.

- [#21](https://github.com/l7aromeo/meocord/pull/21) [`bebf116`](https://github.com/l7aromeo/meocord/commit/bebf1168466595546017a317b62acd3707ff2d1c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Generate applications with current test tooling: vitest and `@vitest/coverage-istanbul` 5,
  `unplugin-swc` 2, and current eslint, prettier and typescript-eslint. A new application's
  `test:coverage` no longer fails on its decorated entry files.

## 4.0.0-beta.5

### Minor Changes

- [#47](https://github.com/l7aromeo/meocord/pull/47) [`9652436`](https://github.com/l7aromeo/meocord/commit/965243660323277827a64851f28da9cda2c2fe0c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `resolveRoute` and `findRouteConflicts` to `meocord/testing`, for testing which handler a
  component's customId reaches. `resolveRoute(App, { type, customId })` gives the answer dispatch gives
  — across every controller the app registers, for that component type, most specific pattern first —
  as the controller, the handler method and its name, and the captured params, or `undefined`. `findRouteConflicts(App)` returns the
  pattern pairs that can match the same customId, which MeoCord otherwise only warns about at startup.
  Both read decorator metadata only, and dispatch runs on the same matcher.

## 4.0.0-beta.4

### Major Changes

- [#44](https://github.com/l7aromeo/meocord/pull/44) [`e48472e`](https://github.com/l7aromeo/meocord/commit/e48472e9ffee2f0371a7a2a71a4063e99ce61674) Thanks [@l7aromeo](https://github.com/l7aromeo)! - **Breaking:** `meocord/decorator` exports only the decorators. The routing helpers it also exported
  — `getCommandMap`, `getMessageHandlers`, `getReactionHandlers`, `getAutocompleteHandlers`,
  `findAmbiguousRoutes` and `PARAM_SEPARATOR` — are internal to MeoCord now. See the
  [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#internal-helpers-are-no-longer-exported).

## 4.0.0-beta.3

### Patch Changes

- [#40](https://github.com/l7aromeo/meocord/pull/40) [`3629edd`](https://github.com/l7aromeo/meocord/commit/3629eddaf20bd0947d24e5582aa167b2c0ca0d47) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Lint `meocord.config.ts`. The shared ESLint config from `meocord/eslint` ignored it, so the config
  alone skipped the rules every other file follows — unused imports, formatting. It is linted like the
  rest now; the typecheck it already gets is unchanged.

- [#40](https://github.com/l7aromeo/meocord/pull/40) [`80b8302`](https://github.com/l7aromeo/meocord/commit/80b83021894ef8a964a12ac1610c2ec9b40f344e) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Exit with code 1 when the login fails, whatever the entry point does. `app.start()` now sets
  `process.exitCode = 1` before rejecting, so an existing `main.ts` whose `catch` only logs the error no
  longer exits 0 — no `process.exitCode = 1` needs adding to it, and new applications' `main.ts` no
  longer carries one.

## 4.0.0-beta.2

### Major Changes

- [#36](https://github.com/l7aromeo/meocord/pull/36) [`45e564e`](https://github.com/l7aromeo/meocord/commit/45e564e6baff17313037372ec56baa1711a3584c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - **Breaking:** `app.start()` rejects when the login fails. It logged the error and resolved, so a bot
  with an invalid token went on to log "Application started" and exit with code 0, which Docker's
  `restart: on-failure`, systemd and CI all read as success. New applications' `main.ts` sets
  `process.exitCode = 1` when startup fails; add the same to an existing entry point's `catch`. See the
  [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#4-build-and-start).

### Patch Changes

- [#37](https://github.com/l7aromeo/meocord/pull/37) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Type the CommonJS build as CommonJS. Every entry point's `require` condition resolved to the ESM
  declarations, so a CommonJS TypeScript project was told `meocord/core` is an ES module it cannot
  `require`, even with `skipLibCheck`. Each entry now ships `.d.cts` declarations for `require`, and
  `meocord/eslint` types its `module.exports` array as what `require` returns.

- [#35](https://github.com/l7aromeo/meocord/pull/35) [`b93a771`](https://github.com/l7aromeo/meocord/commit/b93a771b19664345fec4222d5a2c29dcf5b31a0d) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Generate code that passes a new application's own `lint`. A generated guard failed `tsc` and ESLint
  — `GuardInterface` imported as a value, and an unused `context` parameter — and generated message and
  reaction controllers imported names they never used, which only the application's ESLint, run in the
  background after generating, removed. New applications also typecheck `meocord.config.ts`: the
  template's `tsconfig.json` includes it instead of excluding it, so a type error in the config fails
  `lint`, and editors resolve `paths` aliases imported there. `noEmit` stays on, so `tsc` writes nothing
  beside it.

## 4.0.0-beta.1

### Major Changes

- [#33](https://github.com/l7aromeo/meocord/pull/33) [`21b06ae`](https://github.com/l7aromeo/meocord/commit/21b06ae6810cfe203abadcadc6f7b7247c7b305b) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Require Node.js 22.13 or newer, up from 22.0. A built bot loads its compiled config with `require()`
  of an ES module. Node 22.12 runs that without a flag but still warns on every start and crashes on a
  config that throws; 22.13 is the first 22 release that does neither. Bun is unaffected. See the
  [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#before-you-start-nodejs-2213).

### Patch Changes

- [#33](https://github.com/l7aromeo/meocord/pull/33) [`21b06ae`](https://github.com/l7aromeo/meocord/commit/21b06ae6810cfe203abadcadc6f7b7247c7b305b) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Keep jiti out of bots built with `bundleDependencies`. A built bot loaded `dist/meocord.config.mjs`,
  already compiled JavaScript, through jiti, and the logger and the factory both reach that loader,
  so jiti was bundled into every bot: 190 KB, 89% of a minimal bot's `main.js`, and a
  `Critical dependency` warning on every build. The compiled config is now loaded with `require()`,
  and jiti is only used by the CLI to read `meocord.config.ts`. A minimal bot bundles to 22 KB.

  A built bot no longer falls back to reading `meocord.config.ts` when `dist/meocord.config.mjs` is
  missing, and `meocord build` now fails when the config does not compile, instead of warning and
  producing a bot that cannot start.

- [#31](https://github.com/l7aromeo/meocord/pull/31) [`f50bafc`](https://github.com/l7aromeo/meocord/commit/f50bafce5bcf04b555a7638fedeb6986cf7ea9d5) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Resolve asset imports to files under `dist` in development builds too. `meocord start --dev` gave
  `import logo from './logo.png'` the path `/assets/logo.png`, at the root of the filesystem, so a bot
  reading an imported font or image failed in development while production worked.

- [#32](https://github.com/l7aromeo/meocord/pull/32) [`72b228c`](https://github.com/l7aromeo/meocord/commit/72b228ceaca2dca33ed660aff0ec1bc2aa59bfc2) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Pack only the build platform's native binaries with `bundleDependencies`. Every installed platform
  package was copied into `dist/node_modules`, and bun installs both the glibc and the musl build on
  Linux, so a glibc build of a bot using sharp carried about 19 MB of musl binaries it could never
  load. A package whose `os`, `cpu` or `libc` does not match the platform building is now left out,
  whichever package manager installed it.

## 4.0.0-beta.0

### Major Changes

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Build with [Rsbuild](https://rsbuild.rs) instead of webpack. Production builds are several times
  faster, and webpack and its four loader and plugin packages are no longer installed with MeoCord.
  The output is unchanged: `dist/main.js`, assets under `dist/assets/` with the same names, and the
  same source maps.

  **Breaking:** the `webpack` hook in `meocord.config.ts` is replaced by `rsbuild`, which receives
  Rsbuild's configuration. A config that still declares `webpack` stops the build with a message
  saying so. `MeoCordWebpackConfig` is removed; import `RsbuildConfig` from `meocord/interface`
  instead. The [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#2-replace-the-webpack-hook-with-rsbuild) shows where each
  webpack setting goes.

- [#19](https://github.com/l7aromeo/meocord/pull/19) [`204c7be`](https://github.com/l7aromeo/meocord/commit/204c7bec74886c931732cb771d9178b47fbec5e8) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Require dotenv 18. The `dotenv` peer dependency moves from `^17.4.2` to `^18.0.3`, so install
  `dotenv@18` alongside MeoCord 4. No application code changes — `import 'dotenv/config'` behaves
  the same. See the [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#1-upgrade-dotenv-to-18).

### Minor Changes

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Add `bundleDependencies`, which puts everything a bot needs inside `dist`, so it deploys without
  `node_modules` or an install step. Plain JavaScript dependencies are bundled into `main.js`. Native
  addons such as `sharp` are found while building and copied, with their platform binary, into
  `dist/node_modules` — nothing has to be listed.

  A build carrying native addons records its platform in `dist/meocord.platform.json`, and a bot
  started on another platform stops before going online with a message naming both. Build on the
  platform you deploy to. See
  [Self-contained builds](https://github.com/l7aromeo/meocord#self-contained-builds).

### Patch Changes

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Read `meocord.config.ts` on every build. `meocord build` read the compiled `dist/meocord.config.mjs`
  left by the previous build, so a config edit took effect one build late, and the watcher's reload
  on a config change reloaded nothing.

- [#22](https://github.com/l7aromeo/meocord/pull/22) [`4deb96f`](https://github.com/l7aromeo/meocord/commit/4deb96fd73f86a29c46b9bb080c13e6267246cb1) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Start the bot with `bun --no-install` from `meocord start`. Without it, bun downloads any package it
  cannot find while the bot runs, which a bot deployed without `node_modules` would do in
  production. If you start `dist/main.js` with bun yourself, pass the flag too.

- [#25](https://github.com/l7aromeo/meocord/pull/25) [`2179f85`](https://github.com/l7aromeo/meocord/commit/2179f85c2912d45e3fefbf996ca267c19a1a773c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Stop `meocord generate` overwriting files. Slash, context-menu and primary entry point controllers
  all wrote one shared `builders/sample.builder.ts`, so generating a second controller replaced a
  builder you had already edited. Each controller now gets its own `builders/<name>.builder.ts`
  exporting `<Name>CommandBuilder`, and registers a command named after it — `admin/ban` registers
  `admin-ban` — rather than every one registering `sample-slash`. Generating a controller, service or
  guard refuses if any file it would write already exists.

- [#24](https://github.com/l7aromeo/meocord/pull/24) [`5e2a54b`](https://github.com/l7aromeo/meocord/commit/5e2a54b67a1f9f51c4c3a3e8cf51247de2ac2528) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Type `deleted` on `createMockMessage()`. The mock tracks and documents it, but it was missing from
  the type, so `message.deleted` did not compile.

- [#24](https://github.com/l7aromeo/meocord/pull/24) [`5e2a54b`](https://github.com/l7aromeo/meocord/commit/5e2a54b67a1f9f51c4c3a3e8cf51247de2ac2528) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Accept slash command builders that add options. `@CommandBuilder(CommandType.SLASH)` rejected
  `new SlashCommandBuilder().addStringOption(...)`, whose type narrows to
  `SlashCommandOptionsOnlyBuilder`, so the most common builder — one command with an option — did
  not compile.

- [#21](https://github.com/l7aromeo/meocord/pull/21) [`bebf116`](https://github.com/l7aromeo/meocord/commit/bebf1168466595546017a317b62acd3707ff2d1c) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Generate applications with current test tooling: vitest and `@vitest/coverage-istanbul` 5,
  `unplugin-swc` 2, and current eslint, prettier and typescript-eslint. A new application's
  `test:coverage` no longer fails on its decorated entry files.

## 3.2.2

### Patch Changes

- [#13](https://github.com/l7aromeo/meocord/pull/13) [`f8a6b15`](https://github.com/l7aromeo/meocord/commit/f8a6b156e8d22abf88443ba77c605d6d47991ab4) Thanks [@l7aromeo](https://github.com/l7aromeo)! - Update the shipped dependencies — `@clack/prompts` 1.8.0, `@swc/core` 1.16.2, and `webpack`
  5.110.3 — and state the copyright as `2025-present`, including in the notice the CLI prints
  under `--license` and in its help banner.
