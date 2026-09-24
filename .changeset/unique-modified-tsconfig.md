---
'meocord': patch
---

Fix builds that run at the same time, such as CI jobs sharing a runner, failing with a JSON parse error in `modified-tsconfig.json`. Every build wrote its copy of the tsconfig to one fixed file in the system temp directory, so two builds could read each other's half-written file. Each build now writes to a directory of its own, removed when the build exits.
