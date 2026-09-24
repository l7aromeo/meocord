---
'meocord': patch
---

The published `meocord/decorator` types reference `Piped`'s brand through `meocord/interface`, which now exports it as the type `PIPED_BRAND`, instead of through a private shared chunk. A project that emits declarations for classes using `@Validate` or `@UsePipe` no longer risks TS2742 ("cannot be named without a reference to…"). `Piped<T>` behaves as before.
