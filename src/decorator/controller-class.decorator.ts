import { type ControllerOptions } from '@src/interface/index.js'
import { INHERIT_STAGES } from '@src/core/guard-runner.js'
import { guardOwnHandlersWithBaseGuards } from '@src/decorator/guard.decorator.js'
import { makeInjectable } from '@src/util/injectable.util.js'

/**
 * Marks a class as a controller, to be listed in `@MeoCord({ controllers })`.
 *
 * Class-level `@UseGuard`, `@UseInterceptor`, `@UseFilter` and `@Cooldown` on a class it extends also
 * apply to the handlers it declares: its own class stages run first, then each base's, then the
 * method's. Handlers it inherits get the same chain.
 *
 * @param options - `inheritStages: false` to limit the handlers this class declares to its own class
 *   and method stages. Handlers it inherits keep their base's stages either way.
 *
 * @example
 * ```typescript
 * @Controller()
 * export class PingSlashController {
 *   constructor(private pingService: PingService) {}
 *
 *   @Command('ping', PingCommandBuilder)
 *   async ping(interaction: ChatInputCommandInteraction) {
 *     await interaction.reply(await this.pingService.handlePing())
 *   }
 * }
 *
 * // StaffGuard guards `ban`, declared here, as well as every handler StaffController declares
 * @Controller()
 * export class BanController extends StaffController {
 *   @Command('ban', BanCommandBuilder)
 *   async ban(interaction: ChatInputCommandInteraction) {}
 * }
 * ```
 */
export function Controller(options: ControllerOptions = {}) {
  return function (target: abstract new (...args: any[]) => unknown) {
    makeInjectable(target)
    if (options.inheritStages === false) Reflect.defineMetadata(INHERIT_STAGES, false, target)
    guardOwnHandlersWithBaseGuards(target)
  }
}
