---
'meocord': patch
---

`@Guard({ types: [] })` and `@Interceptor({ types: [] })` now throw when the class is decorated. An empty list matched no call, so the guard or interceptor was silently skipped everywhere; for a guard that meant the handlers it was meant to protect ran unprotected. `@Interceptor({ types: ['autocomplete'] })` throws too, since interceptors never run for autocomplete handlers. Leave `types` out to run for every type, or list the types it runs for. A subclass inherits the `types` of the guard or interceptor it extends unless it declares its own.
