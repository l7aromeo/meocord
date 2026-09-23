---
'meocord': minor
---

Add `resolveRoute` and `findRouteConflicts` to `meocord/testing`, for testing which handler a
component's customId reaches. `resolveRoute(App, { type, customId })` gives the answer dispatch gives
— across every controller the app registers, for that component type, most specific pattern first —
as the controller, method and captured params, or `undefined`. `findRouteConflicts(App)` returns the
pattern pairs that can match the same customId, which MeoCord otherwise only warns about at startup.
Both read decorator metadata only, and dispatch runs on the same matcher.
