import { type StageParams } from '@src/interface/stage-params.interface.js'

/**
 * One entry of `@UseGuard`, `@UseInterceptor`, `@UseFilter`, `@UsePipe` or `@MeoCord`'s lists, checked
 * against the class it provides: `params` against the params the class declares. An entry typed only as
 * the base shape, whose `provide` is any class, keeps taking any params.
 */
export type CheckedEntry<E, Base extends abstract new (...args: any[]) => unknown> = E extends { provide: infer C extends Base }
  ? { provide: C; params?: StageParams<C> }
  : E extends Base
    ? E
    : Base | { provide: Base; params?: Record<string, any> }
