---
'meocord': patch
---

A controller or service whose constructor parameter has no runtime type now stops `MeoCordFactory.create`, and the testing module, before anything is bound. The error names the class, the parameter and the classes that inject it, and says how to fix it. This happens when two services import each other, or a parameter is typed with an interface or an `import type`; the error inversify raised before pointed at the compiler options instead. `meocord/eslint` now warns on import cycles (`import-x/no-cycle`, type-only imports ignored) in projects that have `eslint-import-resolver-typescript`, which it needs to follow imports through `@src`. New projects include it; in a project without it the check stays off and lint is unchanged. Add it with `npm i -D eslint-import-resolver-typescript` to get the warning.
