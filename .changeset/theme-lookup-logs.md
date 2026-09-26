---
'meocord': patch
---

A `themeFor` resolver that fails for many servers or users at once, such as when its database is down, is logged in one line for the resolver and one more when every one answers again, instead of a line for each. One server or user that keeps failing is still logged on its own, once, and again when it answers. A theme that is not a plain object is refused with a clearer message: an object with no named class reads "an object without a plain prototype", and the advice is to give a plain object, such as `{ ...value }` or a row's `toObject()`.
