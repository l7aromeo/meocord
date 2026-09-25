---
'meocord': minor
---

`ExecutionContext.getHandlerParams<P>()` returns the handler's params, its second argument, to any stage: a command's options, a component's customId params or a modal's fields. A guard sees them raw, an interceptor raw before `next.handle()` and validated and piped after it, and a filter as they were when the error was thrown. It is `undefined` for message, reaction and event handlers, and for a call no handler was reached for. It is separate from `getParams()`, which stays the running stage's own `{ provide, params }`. `createExecutionContext` takes `handlerParams` for unit tests. `getArgs()` now returns the arguments as they stand too, so after validation and pipes its second argument is the validated and piped params, the same value `getHandlerParams()` returns; in 4.1.0-beta.1 to beta.3 it kept returning the raw arguments.
