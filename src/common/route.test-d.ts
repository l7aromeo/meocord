import { describe, expectTypeOf, it } from 'vitest'
import { type ButtonInteraction } from 'discord.js'
import { route } from '@src/common/index.js'
import { Command } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'

/** Runs under `vitest --typecheck`: what a route's `build` takes, and that `@Command` takes a route. */

describe('route', () => {
  it("takes one value for each of the pattern's params, and no others", () => {
    const ticket = route('ticket/{id}/{action}')

    expectTypeOf(ticket.build({ id: '42', action: 'close' })).toEqualTypeOf<string>()
    ticket.build({ id: 42n, action: 'close' })
    // @ts-expect-error a param is missing
    ticket.build({ id: '42' })
    // @ts-expect-error the pattern has no {reason}
    ticket.build({ id: '42', action: 'close', reason: 'spam' })
    // @ts-expect-error values are required
    ticket.build()
  })

  it('takes nothing for a pattern without params', () => {
    const refresh = route('refresh')

    expectTypeOf(refresh.build()).toEqualTypeOf<string>()
    // @ts-expect-error the pattern has no params
    refresh.build({ id: '1' })
  })

  it('keeps its pattern as a literal type', () => {
    expectTypeOf(route('ticket/{id}').pattern).toEqualTypeOf<'ticket/{id}'>()
  })

  it('is what @Command takes in place of the pattern', () => {
    const ticket = route('ticket/{id}')

    class Tickets {
      @Command(ticket, CommandType.BUTTON)
      open(_interaction: ButtonInteraction, _params: { id: string }) {
        return undefined
      }
    }
    expectTypeOf(Tickets).toBeConstructibleWith()
  })
})
