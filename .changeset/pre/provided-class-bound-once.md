---
'meocord': patch
---

Ships every change listed under 4.1.0-beta.2, which was not published on its own. Providers in `@MeoCord({ providers })` and in the testing module's `providers` can be listed in any order: a class listed there is bound once, even when a provider earlier in the list injects it.
