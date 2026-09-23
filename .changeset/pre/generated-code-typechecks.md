---
'meocord': patch
---

Generate code that passes a new application's own `lint`. A generated guard failed `tsc` and ESLint
— `GuardInterface` imported as a value, and an unused `context` parameter — and generated message and
reaction controllers imported names they never used, which only the application's ESLint, run in the
background after generating, removed. New applications also typecheck `meocord.config.ts`: the
template's `tsconfig.json` includes it instead of excluding it, so a type error in the config fails
`lint`, and editors resolve `paths` aliases imported there. `noEmit` stays on, so `tsc` writes nothing
beside it.
