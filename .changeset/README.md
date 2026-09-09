# Changesets

This folder holds the pending release notes. Each file in it is one change, written by
whoever made it, describing what a user of the published package would notice.

Add one to a pull request that changes what MeoCord does:

```bash
bun run changeset
```

The prompt asks for a bump — `patch`, `minor`, or `major` — and a description. It writes a
markdown file here; commit it alongside your change.

**Not every pull request needs one.** A change that never reaches the published package —
README edits, CI configuration, tests, internal refactors — has nothing to tell a user, so
it ships with no changeset. Judge by what a consumer installs, not by which file you edited.
JSDoc compiles into the shipped `.d.ts` and is what a user reads in their editor, so
correcting a wrong `@example` is a `patch` even though you only touched a comment.

When these reach `main`, a bot opens a "Version Packages" pull request that consumes every
file here, bumps the version, and writes `CHANGELOG.md`. Merging that pull request is what
publishes to npm — nothing publishes until you do.

Full documentation: https://github.com/changesets/changesets
