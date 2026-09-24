---
'meocord': patch
---

Fix building an application whose `tsconfig.json` uses `extends`, `files`, or `compilerOptions.typeRoots`. MeoCord builds from a copy of `tsconfig.json` in a temporary directory, and a relative `extends` or `files` entry in that copy pointed at files that are not there; a package in `extends`, such as `@tsconfig/node22/tsconfig.json`, could not be found from there either. The copy now carries absolute paths, with a package resolved from the project's `node_modules`. `typeRoots` is read from `compilerOptions`, where TypeScript declares it, and `include` and `exclude` are resolved even without `compilerOptions`.
