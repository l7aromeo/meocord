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

/**
 * The bound classes reachable from `roots`, each after everything it injects: the order lifecycle
 * hooks run in. Roots are the listed services, then the controllers, so classes with no dependency
 * between them keep that declaration order.
 */
export function dependencyOrder(container: Container, roots: LifecycleClass[]): LifecycleClass[] {
  const ordered: LifecycleClass[] = []
  const seen = new Set<LifecycleClass>()
  const visit = (cls: LifecycleClass) => {
    if (seen.has(cls)) return
    seen.add(cls)
    lifecycleDependencies(container, cls).forEach(visit)
    ordered.push(cls)
  }
  roots.forEach(visit)
  return ordered
}
