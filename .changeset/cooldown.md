---
'meocord': minor
---

Limit how often a handler runs with `@Cooldown`.

- `@Cooldown({ seconds, uses, per, bypass })` on an interaction or message handler, or a controller, allows `uses` calls within `seconds` (a sliding window), counted per `'user'`, `'guild'`, `'channel'` or `'global'`. Stack several for layered limits, counted in the order they read; `bypass` exempts callers such as owners. Counts are kept under the class name, so two same-named classes are refused at startup when either has a cooldown or a `@Once` handler.
- It is counted after guards, validation and pipes, so a denied call or bad input spends nothing. A blocked call throws `CooldownError` (from `meocord/common`), which the built-in fallback answers only to the caller with `cooldownMessage()`: "Slow down: try again in 12s."
- Calls are counted in memory by default. `@MeoCord({ cooldownStore })` takes a class extending `CooldownStore`, such as one on Redis, to share the count across shards and processes; with process sharding and the in-memory store, the bot warns that `'user'` and `'global'` cooldowns count per shard.
- `inspectHandler(...).cooldowns` lists a handler's cooldowns.
