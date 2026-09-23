---
'meocord': patch
---

pr: #25

Stop `meocord generate` overwriting files. Slash, context-menu and primary entry point controllers
all wrote one shared `builders/sample.builder.ts`, so generating a second controller replaced a
builder you had already edited. Each controller now gets its own `builders/<name>.builder.ts`
exporting `<Name>CommandBuilder`, and registers a command named after it — `admin/ban` registers
`admin-ban` — rather than every one registering `sample-slash`. Generating a controller, service or
guard refuses if any file it would write already exists.
