import 'reflect-metadata'
import { type ServiceIdentifier } from 'inversify'
import { type ActivityOptions, type ClientOptions } from 'discord.js'
import { MetadataKey } from '@src/enum/index.js'
import {
  type ExceptionFilter,
  type GuardInterface,
  type InterceptorInterface,
  type ResponsePresenter,
} from '@src/interface/index.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { assertStageEntries } from '@src/core/stage-scope.js'
import { type Translator } from '@src/common/translator.js'
import { type CooldownStore } from '@src/common/cooldown-store.js'

/**
 * Declares the MeoCord application class: its controllers, services, client options and activities.
 *
 * The options are stored as metadata; `MeoCordFactory.create()` builds the application from them.
 *
 * @param options.controllers - Controllers to register.
 * @param options.clientOptions - Options for the discord.js `Client`.
 * @param options.activities - Activities the bot rotates through, if any.
 * @param options.services - Services to register that no controller depends on.
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
 * })
 * class App {}
 * ```
 */
export function MeoCord(options: {
  controllers: ServiceIdentifier[]
  clientOptions: ClientOptions
  activities?: ActivityOptions[]
  services?: ServiceIdentifier[]
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
}): (target: any) => void {
  return (target: any): void => {
    assertStageEntries('@MeoCord({ guards })', 'guard', target.name, options.guards ?? [])
    assertStageEntries('@MeoCord({ interceptors })', 'interceptor', target.name, options.interceptors ?? [])
    assertStageEntries('@MeoCord({ filters })', 'filter', target.name, options.filters ?? [])
    makeInjectable(target)

    Reflect.defineMetadata(MetadataKey.AppOptions, options, target)
  }
}
