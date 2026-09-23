---
'meocord': major
---

**Breaking:** `meocord/decorator` exports only the decorators. The routing helpers it also exported
— `getCommandMap`, `getMessageHandlers`, `getReactionHandlers`, `getAutocompleteHandlers`,
`findAmbiguousRoutes` and `PARAM_SEPARATOR` — are internal to MeoCord now. See the
[migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#internal-helpers-are-no-longer-exported).
