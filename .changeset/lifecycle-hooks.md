---
'meocord': minor
---

Add lifecycle hooks. A controller or service that implements `OnReady` from `meocord/interface` has `onReady(client, { primary })` called once the bot is ready; one that implements `OnShutdown` has `onShutdown()` called on SIGINT or SIGTERM, before the client is destroyed. Hooks run on every controller and service the app binds, including services no handler has used yet. `onReady` hooks run one at a time in dependency order, each class after the classes it injects, and never wait for command registration; `onShutdown` hooks run in reverse order. A hook that throws is logged and the next one still runs. Shutdown waits for the `onShutdown` hooks up to the new `shutdownTimeout` option in `meocord.config.ts` (10 seconds by default), then destroys the client and exits 0.

A process now adds one SIGINT and one SIGTERM listener however many apps it starts, so a test suite that creates many apps no longer triggers Node's `MaxListenersExceededWarning`.
