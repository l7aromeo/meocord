---
'meocord': minor
---

Add `TestingModule.invoke` and `inspectHandler` to `meocord/testing`, for testing a handler the way the bot runs it.

- `module.invoke(Controller, 'method', ...args)` runs the handler through the same pipeline dispatch uses, starting with its guards, class guards first and each once. Guards resolve from the testing module, so `overrideGuard` stubs apply and guards that inject `ExecutionContext` receive it. It resolves to `{ ran }`, `false` when a guard denied the call, and the method name and arguments are type-checked against the handler.
- `inspectHandler(Controller, 'method')` reports the guards that run for a handler, in order, and reads its metadata as `ExecutionContext` does, without building a module.
- The generated app's `RateLimitGuard` spec now runs its handler with `invoke`.

Calling a controller method directly in a test still runs its guards, as before.
