import { type Container } from 'inversify'
import { Client } from 'discord.js'
import { injectedTokens } from '@src/core/guard-runner.js'

type LifecycleClass = new (...args: any[]) => any

/**
 * Whether a token a class injects is one of the app's own classes: not the Discord client, bound as a
 * value, and not a built-in constructor such as the `Object` an interface-typed parameter records.
 */
export function isAppClassToken(token: unknown): token is LifecycleClass {
  return (
    typeof token === 'function' &&
    token !== Client &&
    !Function.prototype.toString.call(token).includes('[native code]')
  )
}

/**
 * The bound classes `cls` injects, by constructor type or `@inject` token: the classes whose hooks
 * run before its own.
 */
export function lifecycleDependencies(container: Container, cls: LifecycleClass): LifecycleClass[] {
  return injectedTokens(cls).filter(
    (token): token is LifecycleClass => isAppClassToken(token) && container.isBound(token),
  )
}

/** One thing whose lifecycle hooks run: a class or a provided token, its name for logs, and what it depends on. */
export interface LifecycleUnit {
  token: unknown
  name: string
  dependencies: unknown[]
}

/** The units for a list of classes already in dependency order, as the app runs them without providers. */
export function classUnits(container: Container, classes: readonly LifecycleClass[]): LifecycleUnit[] {
  return classes.map(cls => ({ token: cls, name: cls.name, dependencies: lifecycleDependencies(container, cls) }))
}
