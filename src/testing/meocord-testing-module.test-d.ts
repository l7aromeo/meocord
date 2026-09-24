import { describe, expectTypeOf, it } from 'vitest'
import { type ButtonInteraction, type Message } from 'discord.js'
import { type InvocationResult, MeoCordTestingModule } from './meocord-testing-module.js'
import { createExecutionContext } from './execution-context.js'
import { getResponse } from './response.js'

/**
 * Runs under `vitest --typecheck`. The negative case uses `@ts-expect-error`,
 * which fails once the rejected form starts compiling.
 */

class NotificationService {
  private readonly prefix = '[bot] '

  async notify(message: string): Promise<string> {
    return this.prefix + message
  }

  async broadcast(message: string): Promise<string> {
    return this.prefix + message
  }
}

describe('overrideProvider', () => {
  // Asserted by calling it, not by inspecting the parameter type: `T` extends
  // `Partial<T>`, so `.parameter(0).toExtend<Partial<T>>()` holds under both
  // signatures and proves nothing. Passing a genuine partial is what fails when
  // the parameter tightens back to `T`.
  it('accepts a double covering only the methods under test', () => {
    MeoCordTestingModule.create({})
      .overrideProvider(NotificationService)
      .useValue({ notify: async () => 'ok' })
  })

  // Cannot distinguish `Partial<T>` from `T` — both reject it — but it does
  // catch a loosening to `Record<string, unknown>` or `any`.
  it('rejects a misspelled method name', () => {
    MeoCordTestingModule.create({})
      .overrideProvider(NotificationService)
      // @ts-expect-error `notifi` is not a method on NotificationService.
      .useValue({ notifi: () => Promise.resolve('') })
  })
})

class ProfileController {
  show(_interaction: ButtonInteraction, _params: { id: string }): Promise<void> {
    return Promise.resolve()
  }
}

describe('invoke', () => {
  const module = MeoCordTestingModule.create({ controllers: [ProfileController] }).compile()
  const interaction = {} as ButtonInteraction

  it('takes the handler arguments', () => {
    expectTypeOf(module.invoke(ProfileController, 'show', interaction, { id: '1' })).toEqualTypeOf<
      Promise<InvocationResult>
    >()
  })

  it('rejects an unknown method and arguments the handler does not take', () => {
    // @ts-expect-error `hide` is not a method on ProfileController.
    void module.invoke(ProfileController, 'hide', interaction, { id: '1' })
    // @ts-expect-error `id` must be a string.
    void module.invoke(ProfileController, 'show', interaction, { id: 1 })
  })
})

describe('the testing helpers, misused', () => {
  it('rejects a method createExecutionContext cannot find', () => {
    // @ts-expect-error `hide` is not a method on ProfileController.
    void createExecutionContext(ProfileController, 'hide')
  })

  it('rejects arguments an event does not pass to emit', () => {
    const module = MeoCordTestingModule.create({}).compile()
    // @ts-expect-error guildMemberAdd passes a GuildMember
    void module.emit('guildMemberAdd', 'member')
    // @ts-expect-error not a client event
    void module.emit('memberJoined')
  })

  it('takes only an interaction in getResponse', () => {
    // @ts-expect-error a message has no response state
    void getResponse({} as Message)
  })
})
