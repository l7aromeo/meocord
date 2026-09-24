---
'meocord': patch
---

A command that throws after deferring its reply is now answered instead of left showing "thinking…" until it times out: the deferred reply is edited into the error message. A command or component that throws after it already replied now gets a private follow-up with the error, where it used to get nothing. Buttons, select menus and modals submitted from a message are always answered with a private follow-up, never by editing the message the user clicked. Unanswered interactions are answered exactly as before.

If you want a different answer in these cases — a different text, no answer, or a log to an error service — register an exception filter with `@Catch()` in `@MeoCord({ filters })`: filters run before this built-in answer and replace it.
