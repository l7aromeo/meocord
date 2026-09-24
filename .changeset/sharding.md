---
'meocord': minor
---

Add sharding, configured by `sharding` in `meocord.config.ts`.

- `sharding: { shards: 'auto' }` (or a number) runs every shard in one process, in one client, with nothing else changing. Unset, `clientOptions.shards` works as before.
- `mode: 'process'` runs each shard in its own process. `meocord start`, `node dist/main.js`, bun and process managers such as pm2 all start a manager that registers the commands once, spawns the shards from the built bundle, restarts a shard that exits with a growing delay, stops everything with exit code 1 when a shard's token is invalid or its intents are disallowed, and on SIGINT or SIGTERM shuts every shard down through its `onShutdown` hooks before killing any left after `shutdownTimeout` plus five seconds. Under `meocord start --dev` every shard runs in one process unless `sharding.development` is `true`.
- `ShardContext` from `meocord/core` gives the shards of the current process and calls a service method in every shard with `call(Service, 'method', ...args)`, one result per process. `onReady`'s `primary` is `true` only in the process running shard 0.
- `MeoCordFactory.create()` now returns the new `MeoCordApplication` type, with the same `start()` and `registerCommands()` as before.
- The generated `meocord.config.ts` shows the `sharding` option, commented out.
