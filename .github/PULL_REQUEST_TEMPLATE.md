## What changed

<!-- What this does and why. Link the issue it closes, if there is one. -->

## Release impact

<!--
The commit prefix decides whether this publishes. Judge by what reaches the installed package,
not by which file you edited — JSDoc compiles into the shipped .d.ts, so fixing a wrong @example
is a `fix:`, not `docs:`. See CONTRIBUTING.md.
-->

- [ ] `feat:` — minor
- [ ] `fix:` / `perf:` — patch
- [ ] `BREAKING CHANGE:` in the body — major
- [ ] Non-releasing (`docs:`, `test:`, `ci:`, `chore:`, `refactor:`, `style:`)

## Checklist

- [ ] `bun run lint` passes
- [ ] `bun run test` passes
- [ ] Tests cover the new behaviour, or this changes no behaviour
- [ ] If `src/bin/` was touched: `bun run build && bun run verify:generated` passes
- [ ] Public API changes are reflected in the README and in the JSDoc a user reads in their editor
