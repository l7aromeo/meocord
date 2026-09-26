---
'meocord': patch
---

A `themeFor` resolver that fails and answers by turns for one server or user, such as a flaky connection asked on every backoff, is no longer logged on every turn. It is logged when it starts failing, when it first answers, and once more if it fails again before it has answered two lookups in a row; after that it is logged only once it has, whatever `themeCache.ttlSeconds` is. A server or user that fails once and then answers is logged as before.
