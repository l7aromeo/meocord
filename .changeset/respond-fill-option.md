---
'meocord': minor
---

`respond()`'s `send()`, `edit()` and `followUp()` take `{ fill: false }` as a second argument, which sends that message's embeds and Components V2 containers as written, without the theme's primary colour `respond()` otherwise gives one with no colour. It applies to that message only. The options type is `ResponseSendOptions`, from `meocord/common`.
