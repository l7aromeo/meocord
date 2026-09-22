---
'meocord': major
---

Require dotenv 18. The `dotenv` peer dependency range narrows from `^17.4.2` to `^18.0.3`,
and generated applications pin the same.

Nothing MeoCord does changes. The only dotenv usage in the framework is the generated
`meocord.config.ts`, whose `import 'dotenv/config'` behaves identically under 18 — a real
generated app was loaded through `loadMeoCordConfig()` against dotenv 18.0.3 and read its
token from `.env` as before. dotenv 18 does drop `.env.vault` support, which MeoCord never
used, and moves its injection notice from stdout to stderr, which matters only if you parse
that output in a deploy script.

What breaks is installation, not behaviour: an existing bot still on dotenv 17 no longer
satisfies the peer range. npm 7+ fails with `ERESOLVE`, pnpm errors on the unmet peer, and
bun and yarn warn. The fix on your side is `npm install dotenv@18`; no application code
needs to change.
