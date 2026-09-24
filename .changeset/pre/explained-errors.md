---
'meocord': minor
---

`isExplainedError(error)` in `meocord/common` tells whether MeoCord has already logged what went wrong with an error `app.start()` rejects with, and what to do about it, such as a privileged intent Discord refused. New apps' `main.ts` uses it to skip logging such an error a second time with its stack trace; an existing app can do the same:

```typescript
bootstrap().catch(error => {
  if (!isExplainedError(error)) logger.error('Error during startup:', error)
})
```
