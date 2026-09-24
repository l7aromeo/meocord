import 'reflect-metadata'
import { type ClientEvents } from 'discord.js'
import { ownHandlerList } from '@src/decorator/controller.decorator.js'

const EVENT_HANDLER_METADATA_KEY = Symbol('event_handlers')

/** One `@On` or `@Once` declaration: the event, the method handling it, and whether it runs only once. */
export interface EventHandlerMetadata {
  event: keyof ClientEvents
  method: string
  once: boolean
}

function eventDecorator<E extends keyof ClientEvents>(event: E, once: boolean) {
  // Generic over the method, so it is checked against the event's arguments rather than required to match exactly
  return function <F extends (...args: ClientEvents[E]) => unknown>(
    target: object,
    propertyKey: string,
    _descriptor: TypedPropertyDescriptor<F>,
  ) {
    const handlers = ownHandlerList<EventHandlerMetadata>(EVENT_HANDLER_METADATA_KEY, target)
    handlers.push({ event, method: propertyKey, once })
    Reflect.defineMetadata(EVENT_HANDLER_METADATA_KEY, handlers, target)
  }
}

/**
 * Handles a discord.js client event on a controller or service, every time it is emitted.
 *
 * The handler's parameters are typed from discord.js's `ClientEvents`. It runs through the same
 * pipeline as a command, so `@UseGuard` applies to it, and an error it throws is logged without
 * stopping the bot. The instance is resolved when the first event arrives. Handling
 * `interactionCreate` or `messageCreate` here runs alongside MeoCord's own dispatch of them.
 *
 * @param event - The client event to handle, such as `'guildMemberAdd'`.
 *
 * @example
 * ```typescript
 * @Controller()
 * export class WelcomeController {
 *   constructor(private readonly welcome: WelcomeService) {}
 *
 *   @On('guildMemberAdd')
 *   async greet(member: GuildMember) {
 *     await this.welcome.send(member)
 *   }
 * }
 * ```
 */
export function On<E extends keyof ClientEvents>(event: E) {
  return eventDecorator(event, false)
}

/**
 * Handles a discord.js client event on a controller or service, the first time it is emitted only.
 *
 * Otherwise the same as {@link On}.
 *
 * @param event - The client event to handle, such as `'clientReady'`.
 *
 * @example
 * ```typescript
 * @Service()
 * export class CacheWarmer {
 *   @Once('clientReady')
 *   async warm(client: Client<true>) {
 *     await client.guilds.fetch()
 *   }
 * }
 * ```
 */
export function Once<E extends keyof ClientEvents>(event: E) {
  return eventDecorator(event, true)
}

/**
 * The `@On` and `@Once` handlers declared on a class, inherited ones included.
 *
 * @param target - The class's prototype.
 * @returns The declarations, in the order they were made.
 */
export function getEventHandlers(target: object): EventHandlerMetadata[] {
  return Reflect.getMetadata(EVENT_HANDLER_METADATA_KEY, target) ?? []
}
