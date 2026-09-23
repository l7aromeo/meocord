---
'meocord': patch
---

Exit with code 1 when the login fails, whatever the entry point does. `app.start()` now sets
`process.exitCode = 1` before rejecting, so an existing `main.ts` whose `catch` only logs the error no
longer exits 0 — no `process.exitCode = 1` needs adding to it, and new applications' `main.ts` no
longer carries one.
