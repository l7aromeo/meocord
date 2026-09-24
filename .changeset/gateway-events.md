---
'meocord': minor
---

Add gateway event handlers and handler discovery.

- `@On(event)` and `@Once(event)` from `meocord/decorator` handle any discord.js client event on a controller or service, with the handler's parameters typed from `ClientEvents`. Event handlers run through the same pipeline as commands, so guards, interceptors and exception filters apply; an error no filter handles is logged with the event and handler, without stopping the bot. At startup MeoCord warns about intents and partials the handlers need that `clientOptions` lacks, for `@MessageHandler` and `@ReactionHandler` too.
- `HandlerRegistry` from `meocord/core` lists every registered handler — commands (one entry per subcommand path), components, modals, autocomplete, message, reaction and event handlers — with the metadata declared on it. Inject it into a service to build a `/help` command or generated docs.
- `TestingModule.emit(event, ...args)` sends an event to a testing module's handlers through the same pipeline, and `MeoCordTestingModule` binds `HandlerRegistry`.
- A guard's `canActivate` now also receives an event handler's arguments, so its first parameter accepts any value, and `@UseGuard` no longer throws when a method's first argument is not an interaction, message or reaction.
- Global guards and interceptors from `@MeoCord({ guards, interceptors })` also run on event handlers. `@Guard({ types })` and `@Interceptor({ types })` limit a guard or interceptor to the context types it is written for, at every level, and at startup MeoCord names each global one without `types` that will also run on events. With no stage that applies to a call, no execution context is built.
