---
'meocord': patch
---

Lint `meocord.config.ts`. The shared ESLint config from `meocord/eslint` ignored it, so the config
alone skipped the rules every other file follows — unused imports, formatting. It is linted like the
rest now; the typecheck it already gets is unchanged.
