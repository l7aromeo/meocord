---
'meocord': patch
---

Fix the `RateLimitGuard` in generated applications, which never limited anything. A new guard instance is created for every call, so the counts it kept on the instance started empty each time. The guard now keeps its counts at module level, and its options are plain properties that `@UseGuard({ provide: RateLimitGuard, params: { limit, windowInSeconds } })` sets. Its spec now checks limiting across calls.

The guard is copied into your application when it is created, so upgrading `meocord` does not change it. If your app still has the generated `src/guards/rate-limit.guard.ts`, replace it with the new template, or move its `rateLimits` map out of the class to module level.

The README now explains that a guard instance is created for every call, and shows how to pass options to a guard with `@UseGuard({ provide, params })`.
