---
'meocord': patch
---

A shutdown signal that arrives while the `onReady` hooks are still running no longer calls `onShutdown` on a class whose `onReady` has not finished. Only classes whose `onReady` finished, and those without one, are shut down; the class still starting and those after it are skipped, and no further `onReady` starts once shutdown has begun. The process still exits within `shutdownTimeout`.
