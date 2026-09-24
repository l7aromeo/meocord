# Contributing to MeoCord

Thanks for taking the time. Issues, questions, and pull requests are all welcome.

## Table of Contents

- [Getting set up](#getting-set-up)
- [Making a change](#making-a-change)
- [AI-assisted contributions](#ai-assisted-contributions)
- [What the checks do](#what-the-checks-do)
- [Changesets and releases](#changesets-and-releases)
- [Reporting bugs](#reporting-bugs)
- [Security issues](#security-issues)

## Getting set up

MeoCord builds and tests with [Bun](https://bun.sh), and ships to consumers running Node `>=22.13`.
Bun is the repository's tooling only: the code MeoCord ships — `src/`, and the application templates —
runs on whichever runtime the application chooses, so it uses Node APIs and no Bun-only ones such as
`Bun.serve`, `Bun.file` or `bun:*` modules. `bun run lint` rejects them in `src/`.

```bash
git clone https://github.com/l7aromeo/meocord.git
cd meocord
bun install
bun run test
```

| Command                    | What it does                                                                      |
| -------------------------- | --------------------------------------------------------------------------------- |
| `bun run test`             | Runs the suite, including the `*.test-d.ts` type-level assertions                 |
| `bun run test:watch`       | Same, in watch mode                                                               |
| `bun run test:coverage`    | Runs the suite with istanbul coverage and enforces the thresholds                 |
| `bun run lint`             | Formats, fixes lint, then typechecks the source, test, and eslint projects        |
| `bun run build`            | Clears `dist/` and builds ESM, CJS, and type declarations through rollup          |
| `bun run verify:generated` | Generates an app from the packed build and runs its own checks — see below        |
| `bun run cli:scenarios`    | Runs the packed CLI through what must work and what must fail clearly — see below |
| `bun run changeset`        | Records a release note for your change — see below                                |
| `bun run notices`          | Regenerates THIRD_PARTY_NOTICES.md after a dependency is added or removed         |

## Making a change

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Write a test first where there is behaviour to pin down.
4. If the change reaches the published package, run `bun run changeset` and commit the file it writes.
5. Run `bun run lint` and `bun run test` before pushing.
6. If you touched anything under `src/bin/`, also run `bun run build && bun run verify:generated`.
7. If you added or removed a dependency, run `bun run notices` and commit the result. CI fails when it is out of date.
8. Push and open a pull request against `main`.

Include a description of what changed and why, and add tests for any new behaviour. CI runs everything
above, so nothing is lost if you forget a step — running it locally is just faster than waiting.

Files carry no license header: the [LICENSE](./LICENSE) at the root covers the whole repository.

## AI-assisted contributions

Using AI tools is welcome. Whoever submits a change is its author and is responsible for it — for
its correctness, its tests and everything it ships — exactly as for code written by hand, so
commits carry only the submitter's authorship.

Keep the repository to what the project maintains. Plans, specs, design notes, task lists and other
output a tool produces for its own process stay outside it; they go stale as soon as the work lands.

Agents working on the repository follow [AGENTS.md](AGENTS.md). It changes only with the
maintainer's approval: a pull request that edits it fails CI until the maintainer adds the
`agents-md-approved` label.

## What the checks do

Two classes of bug in this codebase slip past the obvious check, and two jobs exist because of them.

**`verify:generated`** packs `dist` as npm would publish it, generates an application with every
component in it, installs it from the tarball, and runs the application's own checks: ESLint without
`--fix`, both tsconfigs, `test`, `test:coverage`, `build --dev` and `build --prod`. It also generates one
controller of every type flat and nested, in separate projects, and typechecks each. The application
lives in the system temp directory, so it cannot resolve anything from the repository's `node_modules`,
and it needs network access for the install. Asserting on the text a template renders says nothing about
whether that text lints, compiles, tests or builds; shipped bugs have hidden in each of those gaps.

**`cli:scenarios`** installs an application from the packed build and runs the real CLI through scenarios that must succeed and scenarios that must fail: each asserts the exit code, what the output says, and which files were written or left alone. It also fails a scenario that leaves a process running. Run it after `bun run build`; `--only <text>` picks scenarios by name, `--windows` runs the subset that also runs on Windows. `--tier slow` runs the slower scenarios: an application installed with npm, the bun runtime, bundled builds run without `node_modules`, process sharding, and stop signals in each start mode, sent to the process group as Ctrl+C is and to the CLI alone as Docker, pm2 and systemd send them. They reach Discord with a token it refuses, so they need the network; they run before every release and nightly, with `--tier all` running both tiers. Add a scenario whenever a command gains a flag or a failure gains a message.

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

The release pull request is opened by the workflow. With only the workflow's own token, GitHub holds
its CI runs until a maintainer approves them from the pull request's Checks tab, and branch
protection keeps it unmergeable until they pass. A `RELEASE_TOKEN` secret in the `Production`
environment removes that step: a fine-grained personal access token for this repository alone, with
read and write access to Contents and Pull requests. The release pull request is then opened as that
identity and its checks start on their own.

Prereleases use changesets' pre mode, on `main`:

```bash
bunx changeset pre enter beta
```

Committing the resulting `.changeset/pre.json` switches the release pull request to prerelease
versions — `4.0.0-beta.0`, then `4.0.0-beta.1` — published under the `beta` dist-tag rather than
`latest`, so `npm install meocord` keeps resolving the stable release. Changesets keep landing as
usual in the meantime. To ship the stable version, commit the result of:

```bash
bunx changeset pre exit
```

and the next release pull request versions `4.0.0` from everything collected during the beta.

## Reporting bugs

Open an [issue](https://github.com/l7aromeo/meocord/issues/new/choose). The bug form asks for the
MeoCord, discord.js, Node, and runtime versions, because behaviour genuinely differs across them.

A minimal controller that reproduces the problem is worth more than a description of it.

New issues start as `status: needs triage`. A maintainer adds its `type:` and `area:` labels and moves
it to `status: confirmed`, `status: needs reproduction` or `status: needs info`. Issues labelled
`good first issue` or `help wanted` are open for anyone to take on — say so in the issue first.

## Security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](./SECURITY.md).
