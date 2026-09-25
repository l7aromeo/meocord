---
'meocord': minor
---

`meocord/testing` exports `clearAllMocks()` and `resetAllMocks()`, which reach every mock it made: `createMockFn`, and the mocks inside `createMockInteraction`, `createMockClient` and the rest. Vitest's `clearMocks` and jest's `clearAllMocks()` only reach their own `vi.fn()` and `jest.fn()`. New projects call `resetAllMocks()` after every test from `vitest.setup.ts`. To do the same in an existing project, add `afterEach(() => resetAllMocks())` to a Vitest setup file, and set what a mock returns in the test, or in `beforeEach`, that relies on it.
