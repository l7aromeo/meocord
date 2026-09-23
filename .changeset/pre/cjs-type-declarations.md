---
'meocord': patch
---

pr: #37
commit: a9452c256beace70141bb87ed33c693d14064d14

Type the CommonJS build as CommonJS. Every entry point's `require` condition resolved to the ESM
declarations, so a CommonJS TypeScript project was told `meocord/core` is an ES module it cannot
`require`, even with `skipLibCheck`. Each entry now ships `.d.cts` declarations for `require`, and
`meocord/eslint` types its `module.exports` array as what `require` returns.
