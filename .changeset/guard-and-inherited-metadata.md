---
'meocord': patch
---

Fix handlers of a controller that extends another controller being added to the parent class too. A subclass's `@Command`, `@MessageHandler`, `@ReactionHandler` and `@Autocomplete` handlers were written into the base class's metadata, so the base controller listed, and could be routed to, handlers it does not have. Each class now keeps its own copy, including the handlers it inherits.

Fix the guard list stored under `MetadataKey.Guards` when `@UseGuard` is used on both a class and its methods. The class-level list replaced the method's own guards; it now holds every guard that runs, class-level guards first, in the order they run. Which guards run is unchanged.
