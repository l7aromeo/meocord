---
'meocord': minor
---

Add global guards: `@MeoCord({ guards })` runs guards before every dispatched handler — commands, components, modals, autocomplete, message and reaction handlers — ahead of the controller's and the method's own guards. Entries take the same forms as `@UseGuard`, a guard class or `{ provide, params }`, and guards that inject `ExecutionContext` receive it. A controller method called directly still runs only its own guards.

For tests, `MeoCordTestingModule.create({ app: App, ... })` reads the application's global guards, so `module.invoke` runs them first, and `inspectHandler(Controller, 'method', { app: App })` lists them first. Controllers and providers are still listed as before.
