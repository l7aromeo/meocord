---
'meocord': patch
---

A handler may take fewer parameters than dispatch passes, as any TypeScript callback can. `@Command`, `@Autocomplete`, `@MessageHandler` and `@ReactionHandler` on a method with no parameters, such as `async refresh() {}`, failed to compile with TS1241 ("Unable to resolve signature of method decorator"), and `@Validate` or `@UsePipe` on a handler that ignores its input was refused as a mismatch. Both now compile. A parameter of the wrong type is still refused.
