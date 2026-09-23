---
'meocord': patch
---

Stop `meocord generate` overwriting existing files. Every slash, context-menu and primary entry
point controller shared one `builders/sample.builder.ts`, so generating a second controller of the
same type silently replaced a builder you had already edited. Each controller now gets its own
`builders/<name>.builder.ts` exporting `<Name>CommandBuilder`, and registers a command named after
it — `admin/ban` registers `admin-ban` — instead of every one registering `sample-slash`. An
autocomplete controller completes the slash command of the same name.

Generating a controller, service or guard now refuses if any file it would write already exists,
names those files, writes nothing, and exits with a failing status.
