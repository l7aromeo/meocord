---
'meocord': minor
---

New apps from `meocord create` are themed:

- `src/presenters/app.presenter.ts` styles its views from `context.theme`, errors in the colour of their `tone`, and its spec uses `createMockTheme()`.
- `src/types/theme.d.ts` is where the app declares theme tokens of its own, with the `import 'meocord/interface'` that makes it an augmentation.
- `src/assets.d.ts` moves beside it, to `src/types/assets.d.ts`.
- `eslint.config.ts` warns on deprecated APIs in the app's code with `@typescript-eslint/no-deprecated`, so a read of the deprecated `Theme` names `useTheme()`. It is off in specs, which reference mocked methods such as `interaction.reply` whose overloads include deprecated ones.

For an existing app, see [`Theme` is deprecated, and its colours changed](https://github.com/meocord/meocord/blob/main/docs/MIGRATING.md#theme-is-deprecated-and-its-colours-changed).
