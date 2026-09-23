---
'meocord': major
---

Require Node.js 22.13 or newer, up from 22.0. A built bot loads its compiled config with `require()`
of an ES module. Node 22.12 runs that without a flag but still warns on every start and crashes on a
config that throws; 22.13 is the first 22 release that does neither. Bun is unaffected. See the
[migration guide](https://github.com/l7aromeo/meocord/blob/main/docs/MIGRATING.md#before-you-start-nodejs-2213).
