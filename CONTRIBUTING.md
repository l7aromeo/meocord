# Contributing to MeoCord

Thanks for taking the time. Issues, questions, and pull requests are all welcome.

## Table of Contents

- [Getting set up](#getting-set-up)
- [Making a change](#making-a-change)
- [What the checks do](#what-the-checks-do)
- [Commit messages and releases](#commit-messages-and-releases)
- [Reporting bugs](#reporting-bugs)
- [Security issues](#security-issues)

## Getting set up

MeoCord builds and tests with [Bun](https://bun.sh), and ships to consumers running Node `>=22`.

```bash
git clone https://github.com/l7aromeo/meocord.git
cd meocord
bun install
bun run test
```

| Command                    | What it does                                                               |
| -------------------------- | -------------------------------------------------------------------------- |
| `bun run test`             | Runs the suite, including the `*.test-d.ts` type-level assertions          |
| `bun run test:watch`       | Same, in watch mode                                                        |
| `bun run test:coverage`    | Runs the suite with istanbul coverage and enforces the thresholds          |
| `bun run lint`             | Formats, fixes lint, then typechecks the source, test, and eslint projects |
| `bun run build`            | Clears `dist/` and builds ESM, CJS, and type declarations through rollup   |
| `bun run verify:generated` | Generates an app from the built CLI and typechecks it — see below          |

## Making a change

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Write a test first where there is behaviour to pin down.
4. Commit with [conventional commits](#commit-messages-and-releases): `git commit -m "feat: add X"`.
5. Run `bun run lint` and `bun run test` before pushing.
6. If you touched anything under `src/bin/`, also run `bun run build && bun run verify:generated`.
7. Push and open a pull request against `main`.

Include a description of what changed and why, and add tests for any new behaviour. CI runs everything
above, so nothing is lost if you forget a step — running it locally is just faster than waiting.

## What the checks do

Two classes of bug in this codebase slip past the obvious check, and two jobs exist because of them.

**`verify:generated`** generates one controller of every type through the built CLI — flat and nested,
in separate throwaway projects — and typechecks the result against the packaged framework. It runs
against `dist` rather than `src`, so it covers the package `exports` map and the template copy as well
as the templates themselves. Asserting on the text a template renders says nothing about whether that
text compiles; two shipped bugs hid in exactly that gap.

**The Windows job** installs the packed tarball globally and drives the CLI through the `.cmd` shim npm
writes from the interpreter line. Nothing on a POSIX runner exercises that path, and generation is what
walks and writes file paths, so it is also run where the separator and case rules differ.

## Commit messages and releases

Commit messages drive versioning through [semantic-release](https://semantic-release.gitbook.io/).
Only these publish:

| Prefix                         | Release |
| ------------------------------ | ------- |
| `feat:`                        | minor   |
| `fix:`                         | patch   |
| `perf:`                        | patch   |
| `BREAKING CHANGE:` in the body | major   |

Everything else — `docs:`, `test:`, `ci:`, `chore:`, `refactor:`, `style:` — lands on `main` without
publishing and ships with whatever releasable commit comes next.

Pick the prefix by what reaches the installed package, not by which file you edited. JSDoc is compiled
into the published `.d.ts` and is what a user reads in their editor, so correcting a wrong `@example`
is a `fix:` even though you only touched a comment. A README-only change is `docs:`.

Pick it correctly the first time. `main` requires linear history and allows only rebase and squash
merges, both of which discard a commit carrying no patch — so an empty `fix:` commit cannot be used
afterwards to force a release that a mislabelled commit missed.

Releases publish from `main`, `beta`, and `alpha`. Merging to `beta` or `alpha` publishes a prerelease
under the matching npm dist-tag rather than `latest`.

## Reporting bugs

Open an [issue](https://github.com/l7aromeo/meocord/issues/new/choose). The bug form asks for the
MeoCord, discord.js, Node, and runtime versions, because behaviour genuinely differs across them.

A minimal controller that reproduces the problem is worth more than a description of it.

## Security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](./SECURITY.md).
