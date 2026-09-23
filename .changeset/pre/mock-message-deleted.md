---
'meocord': patch
---

pr: #24

Type `deleted` on `createMockMessage()`. The mock tracks and documents it, but it was missing from
the type, so `message.deleted` did not compile.
