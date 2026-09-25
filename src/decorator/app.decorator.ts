import 'reflect-metadata'
import { type ServiceIdentifier } from 'inversify'
import { type ActivityOptions, type ClientOptions } from 'discord.js'
import { MetadataKey } from '@src/enum/index.js'
import {
  type ExceptionFilter,
  type MessageCommandOptions,
  type GuardInterface,
  type InterceptorInterface,
  type ResponsePresenter,
} from '@src/interface/index.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { assertStageEntries } from '@src/core/stage-scope.js'
import { type Translator } from '@src/common/translator.js'
import { type CooldownStore } from '@src/common/cooldown-store.js'
import { type Provider } from '@src/interface/provider.interface.js'
import { providerMap } from '@src/core/providers.js'

/** Refuses a `messages` option of the wrong type where the app is declared, rather than at the first message. */
function assertMessageOptions(messages: MessageCommandOptions | undefined): void {
  if (!messages) return
  const { prefix, mention, caseSensitive } = messages
  const isText = (value: unknown) => typeof value === 'string'
  if (prefix !== undefined && !isText(prefix) && typeof prefix !== 'function' && !(Array.isArray(prefix) && prefix.every(isText))) {
    throw new TypeError('@MeoCord({ messages: { prefix } }) takes a string, a list of strings, or a function of the message returning them.')
  }
  for (const [name, value] of Object.entries({ mention, caseSensitive })) {
    if (value !== undefined && typeof value !== 'boolean') throw new TypeError(`@MeoCord({ messages: { ${name} } }) takes true or false.`)
  }
}

/**
 * Declares the MeoCord application class: its controllers, services, client options and activities.
 *
 * The options are stored as metadata; `MeoCordFactory.create()` builds the application from them.
 *
 * @param options.controllers - Controllers to register.
 * @param options.clientOptions - Options for the discord.js `Client`.
 * @param options.activities - Activities the bot rotates through, if any.
 * @param options.services - Services to register that no controller depends on.
 * @param options.providers - Values classes inject by token with `@Inject`: `{ provide, useValue }`,
 *   `{ provide, useClass }`, or `{ provide, useFactory, inject? }`, whose factory may return a promise,
 *   awaited before login. A token is a class, a string, a symbol or a `createToken` token. Provided
 *   values run their `onReady` and `onShutdown` hooks, in dependency order with the services.
 * @param options.guards - Guards run before every dispatched handler, ahead of the controller's and
 *   the method's own guards: guard classes, or `{ provide, params? }`. A controller method called
 *   directly runs only its own guards.
 * @param options.interceptors - Interceptors run around every dispatched handler except autocomplete,
 *   outside the controller's and the method's own. A controller method called directly runs none.
 * @param options.filters - Exception filters tried after the method's and the controller's, and for
 *   errors outside any handler, such as `CommandNotFoundError`.
 * @param options.cooldownStore - Where `@Cooldown` counts calls, in place of this process's memory: a
 *   class extending `CooldownStore`, resolved like a service so it can inject its client.
 * @param options.i18n - The translator `createTranslator` made, injected as `Translator` wherever a class
 *   asks for one.
 * @param options.presenter - The `ResponsePresenter` that styles loading and error views, resolved once
 *   from the container. Without one, MeoCord's own styling is used.
 * @param options.messages - How `@MessageHandler` patterns match: the `prefix` a message starts with,
 *   a list of them or a function of the message returning them; `mention` to accept a mention of the
 *   bot as well; and `caseSensitive` for the prefix and literal words.
 *
 * @example
 * ```typescript
 * @MeoCord({
 *   controllers: [PingSlashController],
 *   clientOptions: {
 *     intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
 *   },
 *   activities: [{ name: 'with slash commands', type: ActivityType.Playing }],
 *   guards: [BlocklistGuard],
 *   interceptors: [TimingInterceptor],
 *   filters: [ReportingFilter],
 *   providers: [{ provide: DATABASE, useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }) }],
 *   messages: { prefix: '!', mention: true },
 * })
 * class App {}
 * ```
 */
export function MeoCord(options: {
  controllers: ServiceIdentifier[]
  clientOptions: ClientOptions
  activities?: ActivityOptions[]
  services?: ServiceIdentifier[]
  providers?: Provider[]
  guards?: (
    | (new (...args: any[]) => GuardInterface)
    | { provide: new (...args: any[]) => GuardInterface; params?: Record<string, any> }
  )[]
  interceptors?: (
    | (new (...args: any[]) => InterceptorInterface)
    | { provide: new (...args: any[]) => InterceptorInterface; params?: Record<string, any> }
  )[]
  filters?: (
    | (new (...args: any[]) => ExceptionFilter<any>)
    | { provide: new (...args: any[]) => ExceptionFilter<any>; params?: Record<string, any> }
  )[]
  i18n?: Translator<any>
  cooldownStore?: new (...args: any[]) => CooldownStore
  presenter?: new (...args: any[]) => ResponsePresenter
  messages?: MessageCommandOptions
}): (target: any) => void {
  return (target: any): void => {
    assertStageEntries('@MeoCord({ guards })', 'guard', target.name, options.guards ?? [])
    assertStageEntries('@MeoCord({ interceptors })', 'interceptor', target.name, options.interceptors ?? [])
    assertStageEntries('@MeoCord({ filters })', 'filter', target.name, options.filters ?? [])
    // Checked where the app is declared, so a malformed provider fails at import rather than at start
    providerMap(options.providers ?? [], '@MeoCord({ providers })')
    assertMessageOptions(options.messages)
    makeInjectable(target)

    Reflect.defineMetadata(MetadataKey.AppOptions, options, target)
  }
}
