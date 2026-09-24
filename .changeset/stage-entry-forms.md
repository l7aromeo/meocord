---
'meocord': patch
---

`@UseGuard`, `@UseInterceptor`, `@UseFilter`, `@UsePipe`, `@Validate`'s pipes and `@MeoCord({ guards, interceptors, filters })` all take the same entries: a class, or `{ provide: Class, params? }`. `params` is now optional for guards, interceptors and filters too, as it already was for pipes, so `{ provide: ChannelGuard }` works as the class alone; before, a guard or interceptor given that way failed inside the container on its first call.

Anything else, such as `null`, a `provide` that is not a class, or `params` that are not an object, is refused when the decorator applies, with an error naming the decorator and the class or handler, instead of failing when a call first reaches it.
