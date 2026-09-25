---
'meocord': minor
---

`@Cooldown` takes `by`, a function of the call that counts calls apart by a value, such as the account a button acts on: `@Cooldown({ seconds: 3600, by: (_context, { uid }: { uid: string }) => uid })` lets a user check each of their accounts in once an hour, where before the first check-in blocked the rest. `by` receives the handler's params as the handler does, after validation and pipes, and the handler's params are checked against the ones `by` declares at compile time. With `per: 'global'`, the limit is per resource across every user. Returning `undefined` counts as before; an error `by` throws goes to the exception filters, and nothing is counted. `inspectHandler(...).cooldowns` now reports `by` alongside `bypass`.
