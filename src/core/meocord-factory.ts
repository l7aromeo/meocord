import 'reflect-metadata'
import { Container, type ServiceIdentifier } from 'inversify'
import { Client } from 'discord.js'
import { Logger } from '@src/common/index.js'
import { MeoCordApp } from '@src/core/meocord.app.js'
import { loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'
import { assertBuiltForThisPlatform } from '@src/util/platform.util.js'
import { MetadataKey } from '@src/enum/index.js'
import { isRegisterOnly } from '@src/util/registration-mode.util.js'
import { ExecutionContext } from '@src/common/execution-context.js'
import { missingTranslatorError, Translator } from '@src/common/translator.js'
import { CooldownStore, MemoryCooldownStore } from '@src/common/cooldown-store.js'
import { handlerCooldowns } from '@src/core/cooldown-runner.js'
import { getCommandMap, getMessageHandlers } from '@src/decorator/controller.decorator.js'
import { injectedTokens, singletonContextError } from '@src/core/guard-runner.js'
import { appStages, bindGlobalStages, prepareHandlerStages } from '@src/core/handler-pipeline.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { dependencyOrder, isAppClassToken } from '@src/core/lifecycle-order.js'
import { HandlerRegistry } from '@src/core/handler-registry.js'
import { type MeoCordApplication } from '@src/interface/index.js'
import { ShardManager } from '@src/core/shard-manager.js'
import { SHARD_CALL_KEY, type ShardCallHandler, ShardContext } from '@src/core/shard-context.js'
import {
  clientOptionsWithSharding,
  isShardProcess,
  processShardingEnabled,
  shardingRole,
} from '@src/util/sharding-mode.util.js'
import { type MeoCordConfig } from '@src/interface/index.js'

/**
 * Recursively binds a class and all its constructor dependencies to the container in singleton scope.
 */
function bindDependencies(container: Container, cls: any): void {
  if (container.isBound(cls)) return
  if (injectedTokens(cls).includes(ExecutionContext)) throw singletonContextError(cls)

  makeInjectable(cls)

  container.bind(cls).toSelf().inSingletonScope()

  // By constructor type or @inject token; an interface-typed parameter records Object, which is skipped
  for (const dep of injectedTokens(cls)) {
    if (dep === Translator && !container.isBound(Translator)) throw missingTranslatorError(cls)
    if (isAppClassToken(dep)) bindDependencies(container, dep)
  }
}

/**
 * Tells a process-sharded app that its in-memory cooldowns count per shard: a user's calls, and all
 * calls, reach different shards, so `'user'` and `'global'` limits are looser than they read.
 */
function warnPerShardCooldowns(controllers: readonly (new (...args: any[]) => unknown)[], logger: Logger): void {
  const loose = controllers.flatMap(controller => {
    const prototype = controller.prototype as object
    const methods = Object.values(getCommandMap(prototype) ?? {})
      .flat()
      .map(command => command.methodName)
    return [...new Set([...methods, ...getMessageHandlers(prototype).map(handler => handler.method)])]
      .filter(method => handlerCooldowns(prototype, method).some(({ per = 'user' }) => per === 'user' || per === 'global'))
      .map(method => `${controller.name}.${method}`)
  })
  if (loose.length === 0) return

  logger.warn(
    `Each shard counts 'user' and 'global' cooldowns in its own memory, so they allow more calls than they ` +
      `say: ${loose.join(', ')}. Bind a shared store with @MeoCord({ cooldownStore }), such as one on Redis.`,
  )
}

export class MeoCordFactory {
  private static logger = new Logger()

  /**
   * The config a single process runs with. Under `meocord start --dev` without `sharding.development`,
   * process sharding falls back to running every shard in this process, so the watcher restarts one
   * process and leaves no shards behind.
   */
  private static effectiveConfig(config: MeoCordConfig): MeoCordConfig {
    if (config.sharding?.mode !== 'process' || isShardProcess() || processShardingEnabled(config)) return config
    this.logger.info(
      "sharding.mode 'process' is off in development, so every shard runs in this process; set " +
        'sharding.development: true to run them in separate processes.',
    )
    return { ...config, sharding: { ...config.sharding, mode: 'internal' } }
  }

  static create(target: ServiceIdentifier): MeoCordApplication {
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

    // `meocord register` reads the commands from the controllers' prototypes and sends them over REST,
    // so nothing is bound or constructed, and nothing that needs the platform's native addons runs.
    if (isRegisterOnly()) {
      return new MeoCordApp(options.controllers, new Container(), new Client(options.clientOptions), meocordConfig.discordToken)
    }

    // A process-sharding manager only spawns shards, so it binds, constructs and connects nothing itself.
    if (shardingRole(meocordConfig) === 'manager') {
      return new ShardManager({
        controllerClasses: options.controllers,
        token: meocordConfig.discordToken,
        config: meocordConfig,
      })
    }

    // Before anything is resolved: a controller or service is what first loads a native addon, and
    // one built for another platform would otherwise fail there with a linker error.
    assertBuiltForThisPlatform()

    const container = new Container()
    bindGlobalStages(container, appStages(target as object))

    // Bind the Discord client as a constant value
    const discordClient = new Client(clientOptionsWithSharding(this.effectiveConfig(meocordConfig), options.clientOptions))
    container.bind(Client).toConstantValue(discordClient)
    if (options.i18n) container.bind(Translator).toConstantValue(options.i18n)

    // Bound before the app's classes, so a class that injects it gets this instance; filled once they are bound
    const appClasses: (new (...args: any[]) => unknown)[] = []
    container.bind(HandlerRegistry).toConstantValue(new HandlerRegistry(appClasses))
    container
      .bind(ShardContext)
      .toConstantValue(
        new ShardContext(discordClient, (service, method, args) =>
          (Reflect.get(discordClient, SHARD_CALL_KEY) as ShardCallHandler)(service, method, args),
        ),
      )

    // A store of the app's own is resolved like a service, so it can inject its client
    if (options.cooldownStore) {
      bindDependencies(container, options.cooldownStore)
      container.bind(CooldownStore).toService(options.cooldownStore)
    } else {
      container.bind(CooldownStore).toConstantValue(new MemoryCooldownStore())
    }

    // Bind all controllers and their transitive dependencies
    for (const ctrl of options.controllers as any[]) {
      bindDependencies(container, ctrl)
    }
    for (const svc of (options.services ?? []) as any[]) {
      bindDependencies(container, svc)
    }
    appClasses.push(...dependencyOrder(container, [...(options.services ?? []), ...options.controllers]))

    // ShardContext.call reaches a service in another shard by its class name
    const byName = new Map<string, new (...args: any[]) => unknown>()
    for (const cls of appClasses) {
      if (byName.has(cls.name) && meocordConfig.sharding?.mode === 'process') {
        throw new Error(
          `Two classes are named ${cls.name}; with process sharding, ShardContext.call finds a service in ` +
            `another shard by its name, so give each controller and service a distinct name.`,
        )
      }
      byName.set(cls.name, cls)
    }
    const runHere = async (service: string, method: string, args: unknown[]) => {
      const cls = byName.get(service)
      if (!cls) throw new Error(`${service} is not a controller or service of this app.`)
      const instance = container.get(cls) as Record<string, (...args: unknown[]) => unknown>
      if (typeof instance[method] !== 'function') throw new Error(`${service}.${method} is not a method.`)
      return instance[method](...args)
    }
    Reflect.set(discordClient, SHARD_CALL_KEY, runHere)

    // Stamp each class with the container so @UseGuard can resolve guards on a direct call
    for (const cls of appClasses) {
      Reflect.defineMetadata(MetadataKey.Container, container, cls)
    }

    // Eagerly instantiate standalone services so their constructors run.
    // This is critical for event-driven services that register Discord event
    // listeners (or connect to external systems) inside their constructor.
    for (const svc of (options.services ?? []) as any[]) {
      container.get(svc)
    }

    prepareHandlerStages(container, appClasses)
    if (shardingRole(meocordConfig) === 'shard' && container.get(CooldownStore) instanceof MemoryCooldownStore) {
      warnPerShardCooldowns(options.controllers, this.logger)
    }

    return new MeoCordApp(
      options.controllers,
      container,
      discordClient,
      meocordConfig.discordToken,
      options.activities,
      appClasses,
      meocordConfig.shutdownTimeout,
    )
  }
}
