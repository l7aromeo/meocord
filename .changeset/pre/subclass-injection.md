---
'meocord': patch
---

Fix dependency injection for a controller, service or guard that extends another decorated class. The subclass was treated as already set up because its base class was, so its own constructor's dependencies were never injected: a subclass with its own constructor failed to resolve, and one without a constructor was built with no arguments. A subclass now gets its own constructor's dependencies, or its base class's when it declares no constructor, and inherits its base class's injected properties. No change is needed in your code.
