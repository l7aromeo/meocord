---
'meocord': patch
---

A `themeFor` resolver that fails for many servers or users at once, such as when its database is down, is logged in two lines, the first server or user and one for the resolver, and their answers the same way, instead of a line for each. Only time ends such a burst, so every later outage is logged too, and a server or user that keeps failing is logged once, when it starts. A theme that is not a plain object is refused with a clearer message: an object with no named class reads "an object without a plain prototype", and the advice is to give a plain object, such as `{ ...value }` or a row's `toObject()`.
