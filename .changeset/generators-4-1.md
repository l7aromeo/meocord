---
'meocord': patch
---

`meocord generate` writes components that fit a 4.1 app as they are.

- A button, modal or select menu takes its customId from its name, and a message handler its pattern: `meocord g co button ticket` routes `ticket` and `ticket/{id}`, and `meocord g co message ping` matches `ping`. Generated components no longer share the fixed ids `button-click` or `select-menu`, or the `baka` pattern of the sample message controller. With that one listed, the bot stopped at startup: "match the same messages, so only one of them could ever run".
- Controllers answer with `respond()`, and their methods are named after the class: `handleTicket`. The filter template answers with `context.response?.error()`.
- After writing, `generate` names the next step, such as `Next: add TicketButtonController to @MeoCord({ controllers }) in src/app.ts.` It still never edits `src/app.ts`.

New apps from `meocord create` get `src/assets.d.ts`, so `import logo from './logo.png'` and the template's Markdown imports pass the app's own `tsc`. Its coverage settings leave declaration files out. The sample `app.ts` no longer sets an empty custom activity. To add the declarations to an existing app, see [Smaller changes](https://github.com/meocord/meocord/blob/main/docs/MIGRATING.md#smaller-changes).
