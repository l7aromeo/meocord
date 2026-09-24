---
'meocord': minor
---

Validate a handler's input, and transform it with pipes.

- `@Validate(schema)` checks an interaction handler's input with any [Standard Schema](https://standardschema.dev) library (zod, valibot, arktype and others) before it runs; a handler takes one, and a second throws when decorated. The handler receives the schema's output, and its second parameter is type-checked against it. Invalid input throws a `ValidationError` (from `meocord/common`) listing each issue, which the built-in fallback answers privately with that list; an exception filter can phrase it otherwise.
- Pipes turn one validated value into what the handler works with: `@Validate(schema, { pipes: { uid: AccountPipe } })` keeps the handler fully typed, and `@UsePipe(key, ...pipes)` works on its own or beside `@Validate`, where the value it produces is marked `Piped<T>`, whose brand `meocord/interface` exports as the type `PIPED_BRAND` so declarations emitted for such classes can name it. Mark a class `@Pipe()` and implement `PipeInterface`.
- `meocord generate pipe <name>` (alias `pi`) writes a pipe and its spec.
- A modal handler's second argument now also carries the submitted fields, keyed by customId, next to the customId params; a param wins over a field of the same name, with a warning in development.
- `TestingModule.invoke` builds the params from the interaction when a test passes none, and `createModalFields` gives a mock modal its fields.

Existing handlers keep working: modal handlers receive extra keys, and nothing is validated until you add `@Validate`.
