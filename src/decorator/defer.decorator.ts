import 'reflect-metadata'
import { DEFER_OPTIONS, deferMisuseError, type DeferOptions, nonInteractionHandler } from '@src/core/defer.js'

/**
 * Acknowledges an interaction for its handler in two steps, so a slow handler never misses Discord's
 * three seconds and a stranger's click never touches someone else's message.
 *
 * 1. At once, before guards: a deferred reply for a command (`ephemeral` makes it private), or an
 *    invisible deferred update for a component or a modal submitted from a message.
 * 2. After guards, validation and pipes allow the call, for a component: the message's controls are
 *    disabled (`disable`), the clicked button shows the loading emoji, and the presenter's loading view
 *    is added.
 *
 * Answer with `respond(interaction)`: `send()` without `components` puts the message back as it was
 * before step 2. A handler that never answers has its message put back when it returns. A guard that
 * returns `false` leaves nothing behind: a command's deferred reply is deleted.
 *
 * With `mode: 'auto'`, step 1 runs only if nothing answered after `after` milliseconds (1500 by
 * default), and never later than 2.5 seconds after the interaction was created, so a fast handler
 * answers with a single reply or update. A timer cannot fire while synchronous work blocks the event
 * loop, so `'auto'` suits handlers that wait on I/O.
 *
 * For interaction handlers only: `@Defer` on a message, reaction, event or autocomplete handler throws.
 * A handler that shows a modal cannot use `@Defer`, since a modal must be the first response.
 *
 * @param options - `ephemeral`, `suppressNotifications` (default `false`), `disable` (`'all'` by
 *   default, `'clicked'`, or `'none'` to skip step 2), `mode` (`'eager'` by default, or `'auto'`) and
 *   `after`.
 *
 * @example
 * ```typescript
 * @Command('refresh/{uid}', CommandType.BUTTON)
 * @UseGuard(OwnerGuard)
 * @Defer()
 * async refresh(interaction: ButtonInteraction, { uid }: { uid: string }) {
 *   await respond(interaction).send({ embeds: [await this.cards.render(uid)] })
 * }
 * ```
 */
export function Defer(options: DeferOptions = {}): MethodDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const methodName = String(propertyKey)
    const kind = nonInteractionHandler(target, methodName)
    if (kind) throw deferMisuseError(target.constructor.name, methodName, kind)
    Reflect.defineMetadata(DEFER_OPTIONS, { ...options }, target, methodName)
  }
}
