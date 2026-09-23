---
'meocord': major
---

pr: #19

Require dotenv 18. The `dotenv` peer dependency moves from `^17.4.2` to `^18.0.3`, so install
`dotenv@18` alongside MeoCord 4. No application code changes — `import 'dotenv/config'` behaves
the same. See the [migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#1-upgrade-dotenv-to-18).
