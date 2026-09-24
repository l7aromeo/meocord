---
'meocord': minor
---

Add typed handler metadata and `ExecutionContext`, so guards can read what they guard.

- `createMetadata<T>(description)` in `meocord/common` makes a typed decorator for a controller or a handler, with a unique key.
- `ExecutionContext` in `meocord/common` describes the call a guard is deciding on. A guard receives it by constructor injection and reads metadata with `context.get(Roles)`, where the handler's value wins over the controller's. It also gives the handler's arguments, the controller and method, the call type, and the guard's `{ provide, params }` through `getParams()`. `SetMetadata` keys are read with `context.get('roles')`.
- `createExecutionContext(Controller, 'method', { args, params })` in `meocord/testing` builds that context for a guard's unit test.
- `meocord generate guard` now generates a guard that reads a `createMetadata` decorator through `ExecutionContext`, with a spec using `createExecutionContext`.

Existing guards and tests work unchanged: guards run in the same order, once each, whether a handler is dispatched or called directly in a test. A controller or service, which is shared across calls, cannot inject `ExecutionContext`; the bot and `MeoCordTestingModule` refuse to start with a clear error rather than handing one call's context to another.
