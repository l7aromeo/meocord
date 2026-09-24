import 'reflect-metadata'
import { injectable, injectFromBase } from 'inversify'
import { MetadataKey } from '@src/enum/index.js'

/**
 * Makes a class injectable unless it already is itself; a flag inherited from a base class does not
 * count. A subclass also takes its base class's injected properties, and its constructor arguments
 * when it declares no constructor of its own.
 */
export function makeInjectable(target: abstract new (...args: any[]) => unknown): void {
  if (Reflect.hasOwnMetadata(MetadataKey.Injectable, target)) return
  injectable()(target)

  const base: unknown = Object.getPrototypeOf(target)
  if (typeof base !== 'function' || !Reflect.hasMetadata(MetadataKey.Injectable, base)) return
  injectFromBase({
    extendConstructorArguments: !Reflect.hasOwnMetadata(MetadataKey.ParamTypes, target),
    extendProperties: true,
  })(target)
}
