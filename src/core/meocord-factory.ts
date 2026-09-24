import 'reflect-metadata'
import { Container, type ServiceIdentifier } from 'inversify'
import { Client } from 'discord.js'
import { Logger } from '@src/common/index.js'
import { MeoCordApp } from '@src/core/meocord.app.js'
import { loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'
import { assertBuiltForThisPlatform } from '@src/util/platform.util.js'
import { MetadataKey } from '@src/enum/index.js'
import { ExecutionContext } from '@src/common/execution-context.js'
import { injectedTokens, singletonContextError } from '@src/core/guard-runner.js'
import { appStages, bindGlobalStages } from '@src/core/handler-pipeline.js'
import { makeInjectable } from '@src/util/injectable.util.js'

/**
 * Recursively binds a class and all its constructor dependencies to the container in singleton scope.
 */
function bindDependencies(container: Container, cls: any): void {
  if (container.isBound(cls)) return
  if (injectedTokens(cls).includes(ExecutionContext)) throw singletonContextError(cls)

  makeInjectable(cls)

  container.bind(cls).toSelf().inSingletonScope()

  const deps: any[] = Reflect.getMetadata(MetadataKey.ParamTypes, cls) || []
  for (const dep of deps) {
    if (dep === Client) continue
    bindDependencies(container, dep)
  }
}

/**
 * The classes reachable from `roots`, each after everything it injects: the order lifecycle hooks run
 * in. Roots are the listed services, then the controllers, so classes with no dependency between them
 * keep that declaration order.
 */
function dependencyOrder(roots: any[]): any[] {
  const ordered: any[] = []
  const seen = new Set<any>()
  const visit = (cls: any) => {
    if (cls === Client || seen.has(cls)) return
    seen.add(cls)
    for (const dep of Reflect.getMetadata(MetadataKey.ParamTypes, cls) || []) visit(dep)
    ordered.push(cls)
  }
  roots.forEach(visit)
  return ordered
}

export class MeoCordFactory {
  private static logger = new Logger()

  static create(target: ServiceIdentifier): MeoCordApp {
    const options = Reflect.getMetadata(MetadataKey.AppOptions, target)

    if (!options) {
      if (typeof target === 'function') {
        this.logger.error(`No @MeoCord() options found for class: ${(target as any).name}`)
      } else {
        this.logger.error('No @MeoCord() options found for the provided target.')
      }
      throw new Error('Target class is not decorated with @MeoCord().')
    }

    const meocordConfig = loadMeoCordConfig()
    if (!meocordConfig) {
      throw new Error('MeoCord config not found: dist/meocord.config.mjs is missing or failed to load. Run `meocord build`.')
    }

    // Before anything is resolved: a controller or service is what first loads a native addon, and
    // one built for another platform would otherwise fail there with a linker error.
    assertBuiltForThisPlatform()

    const container = new Container()
    bindGlobalStages(container, appStages(target as object))

    // Bind the Discord client as a constant value
    const discordClient = new Client(options.clientOptions)
    container.bind(Client).toConstantValue(discordClient)

    // Bind all controllers and their transitive dependencies
    for (const ctrl of options.controllers as any[]) {
      bindDependencies(container, ctrl)
    }

    // Bind and eagerly instantiate standalone services so their constructors run.
    // This is critical for event-driven services that register Discord event
    // listeners (or connect to external systems) inside their constructor.
    for (const svc of (options.services ?? []) as any[]) {
      bindDependencies(container, svc)
      container.get(svc)
    }

    // Stamp each controller class with the container so @UseGuard can resolve guards
    for (const ctrl of options.controllers as any[]) {
      Reflect.defineMetadata(MetadataKey.Container, container, ctrl)
    }

    return new MeoCordApp(
      options.controllers,
      container,
      discordClient,
      meocordConfig.discordToken,
      options.activities,
      dependencyOrder([...(options.services ?? []), ...options.controllers]),
      meocordConfig.shutdownTimeout,
    )
  }
}
