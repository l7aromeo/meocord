---
'meocord': minor
---

Add `@Defer()`, which acknowledges an interaction for its handler in two steps: a deferred reply (or an invisible deferred update, for a component) before guards run, so slow guards and handlers never miss Discord's three seconds; then, once guards, validation and pipes allow the call, a lock on the component's message — its controls disabled, the clicked button showing the loading emoji, the presenter's loading view added. `respond(interaction).send()` without `components` puts the message back as it was, including buttons that were disabled on purpose, and a handler that never answers has it put back when it returns. A guard that returns `false` leaves nothing behind, and one that throws `GuardDeniedError` is answered privately.

Options: `ephemeral`, `disable` (`'all'`, `'clicked'` or `'none'`), `mode: 'auto'` to acknowledge only when the handler has not answered after `after` milliseconds (1500 by default, and never later than 2.5 seconds after the interaction was created), and `suppressNotifications`. `@Defer` on a message, reaction, event or autocomplete handler throws.
