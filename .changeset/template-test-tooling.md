---
'meocord': patch
---

pr: #21

Generate applications with current test tooling: vitest and `@vitest/coverage-istanbul` 5,
`unplugin-swc` 2, and current eslint, prettier and typescript-eslint. A new application's
`test:coverage` no longer fails on its decorated entry files.
