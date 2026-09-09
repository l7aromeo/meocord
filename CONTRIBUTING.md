# Contributing to MeoCord

Thanks for taking the time. Issues, questions, and pull requests are all welcome.

## Table of Contents

- [Getting set up](#getting-set-up)
- [Making a change](#making-a-change)
- [What the checks do](#what-the-checks-do)
- [Changesets and releases](#changesets-and-releases)
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
| `bun run changeset`        | Records a release note for your change — see below                         |

## Making a change

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Write a test first where there is behaviour to pin down.
4. If the change reaches the published package, run `bun run changeset` and commit the file it writes.
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

## Changesets and releases

Releases run on [changesets](https://github.com/changesets/changesets). A change a consumer
would notice carries its own release note, written by you, in a file under `.changeset/`:

```bash
bun run changeset
```

The prompt asks for a bump and a description, then writes a markdown file. Commit it with your
change.

| Bump    | For                                                        |
| ------- | ---------------------------------------------------------- |
| `patch` | A fix, a performance change, or a correction to what ships |
| `minor` | New capability that does not break an existing bot         |
| `major` | Anything that makes a working bot stop working             |

**Not every pull request needs one.** A change that never reaches the published package — README
edits, CI configuration, tests, internal refactors — has nothing to tell a user, so it ships with
no changeset. Judge by what a consumer installs, not by which file you edited: JSDoc compiles into
the shipped `.d.ts` and is what a user reads in their editor, so correcting a wrong `@example` is a
`patch` even though you only touched a comment.

Getting it wrong is recoverable. A changeset is a file, so a forgotten or mis-sized one is fixed by
committing another — nothing depends on a commit message being right the first time.

### How a release happens

Merging to `main` does not publish. A bot collects every pending changeset into a release pull
request titled `chore: release`, showing the version it computed and the changelog it will write.
**Merging that pull request is what publishes to npm.** It stays open and keeps absorbing changes
until you decide to ship, so batching several changes into one release is the default rather than
something you have to arrange.

Publishing uses npm trusted publishing — the registry issues short-lived credentials to the
workflow, so no npm token is stored anywhere — and every release carries a provenance attestation.

Prereleases use changesets' pre mode on the `beta` branch:

```bash
bunx changeset pre enter beta
```

Commit the resulting `.changeset/pre.json`. Releases from that branch publish as `x.y.z-beta.N`
under the `beta` dist-tag rather than `latest`, until `bunx changeset pre exit` is committed.

## Reporting bugs

Open an [issue](https://github.com/l7aromeo/meocord/issues/new/choose). The bug form asks for the
MeoCord, discord.js, Node, and runtime versions, because behaviour genuinely differs across them.

A minimal controller that reproduces the problem is worth more than a description of it.

## Security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](./SECURITY.md).
