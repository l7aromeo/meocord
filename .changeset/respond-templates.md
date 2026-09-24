---
'meocord': patch
---

New applications from `meocord create` start with the 4.1 patterns. Existing applications are not changed: upgrading `meocord` never touches your code.

- The sample controllers answer through `respond(interaction)`. The button, select menu and modal samples use `@Defer`, and the button sample's second handler is guarded by an `OwnerGuard` that denies with `GuardDeniedError`.
- The slash, button, modal and context menu samples limit how often they run with `@Cooldown({ uses: 5, seconds: 60 })`, and the `RateLimitGuard` and its spec are gone.
- `src/presenters/app.presenter.ts` styles the loading and error views, registered with `@MeoCord({ presenter })`.
- Each sample's spec runs its handler with `invoke` and checks what `respond()` sent.
