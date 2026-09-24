---
'meocord': minor
---

Add lifecycle hooks. A controller or service that implements `OnReady` from `meocord/interface` has `onReady(client, { primary })` called once the bot is ready; one that implements `OnShutdown` has `onShutdown()` called on SIGINT or SIGTERM, before the client is destroyed. Hooks run on every controller and service the app binds, including services no handler has used yet. They run in parallel, never wait for command registration, and a hook that throws is logged without stopping the others. Shutdown waits up to 10 seconds for the `onShutdown` hooks, then destroys the client and exits 0.

A process now adds one SIGINT and one SIGTERM listener however many apps it starts, so a test suite that creates many apps no longer triggers Node's `MaxListenersExceededWarning`.
