---
'meocord': patch
---

The `RateLimitGuard` that 4.0 copied into generated applications never limited anything: a new guard instance is created for every call, so the counts it kept on the instance started empty each time. New applications no longer get it; they limit their sample commands with `@Cooldown`.

Upgrading `meocord` does not change the copy in your application. If your app still has `src/guards/rate-limit.guard.ts`, move its `rateLimits` map out of the class to module level, so every instance shares it, or replace the guard with `@Cooldown({ uses, seconds })`.

The README now explains that a guard instance is created for every call, and shows how to pass options to a guard with `@UseGuard({ provide, params })`.
