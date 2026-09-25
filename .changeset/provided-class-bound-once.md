---
'meocord': patch
---

A class listed in `@MeoCord({ providers })`, or in the testing module's `providers`, is bound once even when a provider earlier in the list injects it. Before, the earlier provider bound it as itself and its own entry bound it again, so the app refused to start ("… is bound by MeoCord, so @MeoCord({ providers }) cannot provide it") and the testing module failed with "Ambiguous bindings found for service". Order no longer matters.
