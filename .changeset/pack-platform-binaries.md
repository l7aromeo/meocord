---
'meocord': patch
---

Pack only the build platform's native binaries with `bundleDependencies`. Every installed platform
package was copied into `dist/node_modules`, and bun installs both the glibc and the musl build on
Linux, so a glibc build of a bot using sharp carried about 19 MB of musl binaries it could never
load. A package whose `os`, `cpu` or `libc` does not match the platform building is now left out,
whichever package manager installed it.
