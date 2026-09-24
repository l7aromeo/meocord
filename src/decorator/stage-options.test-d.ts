import { describe, it } from 'vitest'
import { type ChatInputCommandInteraction } from 'discord.js'
import { Command, Cooldown, Defer, Guard, Interceptor } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { type CallHandler, type GuardInterface, type InterceptorInterface } from '@src/interface/index.js'

/**
 * Runs under `vitest --typecheck`. The negative cases use `@ts-expect-error`,
 * which fails once the rejected form starts compiling.
 */

describe('stage options', () => {
  it('take only the documented context types', () => {
    @Guard({ types: ['interaction', 'message'] })
    class Allowed implements GuardInterface {
      canActivate() {
        return true
      }
    }

    // @ts-expect-error 'command' is not a context type
    @Guard({ types: ['command'] })
    class Wrong implements GuardInterface {
      canActivate() {
        return true
      }
    }

    // @ts-expect-error 'button' is not a context type
    @Interceptor({ types: ['button'] })
    class WrongInterceptor implements InterceptorInterface {
      intercept(_context: never, next: CallHandler) {
        return next.handle()
      }
    }
    void [Allowed, Wrong, WrongInterceptor]
  })

  it('take only the documented cooldown and defer options', () => {
    class Controller {
      @Command('daily', CommandType.SLASH)
      @Cooldown({ seconds: 3, uses: 2, per: 'guild', bypass: () => false })
      @Defer({ ephemeral: true, disable: 'clicked', mode: 'auto', after: 1000, suppressNotifications: true })
      async daily(_interaction: ChatInputCommandInteraction) {
        void _interaction
      }

      @Command('weekly', CommandType.SLASH)
      // @ts-expect-error cooldowns count per user, guild, channel or global
      @Cooldown({ seconds: 3, per: 'server' })
      async weekly(_interaction: ChatInputCommandInteraction) {
        void _interaction
      }

      @Command('monthly', CommandType.SLASH)
      // @ts-expect-error seconds is required
      @Cooldown({ uses: 2 })
      async monthly(_interaction: ChatInputCommandInteraction) {
        void _interaction
      }

      @Command('yearly', CommandType.SLASH)
      // @ts-expect-error disable is 'all', 'clicked' or 'none'
      @Defer({ disable: 'some' })
      async yearly(_interaction: ChatInputCommandInteraction) {
        void _interaction
      }

      @Command('never', CommandType.SLASH)
      // @ts-expect-error mode is 'eager' or 'auto'
      @Defer({ mode: 'lazy' })
      async never(_interaction: ChatInputCommandInteraction) {
        void _interaction
      }
    }
    void Controller
  })
})
