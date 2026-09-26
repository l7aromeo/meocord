---
'meocord': patch
---

A shared guard that calls another shared guard, such as one injected into it, no longer makes the inner guard read the outer guard's `params`. Each guard reads only the params its own `{ provide, params }` entry gives; called directly by another guard, it reads its own values.
