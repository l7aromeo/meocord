import { ChatInputCommandInteraction, type Message } from 'discord.js'
import { Command, Controller, MessageHandler, UsePipe, Validate } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { type StandardSchemaV1 } from '@src/interface/index.js'
import { createChatInputOptions, createMockInteraction, createMockMessage, MeoCordTestingModule } from '@src/testing/index.js'

// The arguments a handler receives are exactly what dispatch passes, with only its input replaced.

const received: unknown[][] = []
beforeEach(() => (received.length = 0))

const minutes: StandardSchemaV1<unknown, { minutes: number }> = {
  '~standard': { version: 1, vendor: 'test', validate: value => ({ value: { minutes: Number((value as { minutes: unknown }).minutes) } }) },
}

@Controller()
class ArgumentsController {
  @MessageHandler('hi')
  async hi(...args: [Message, Record<string, string>]) {
    received.push(args)
  }

  @MessageHandler()
  async everything(...args: [Message]) {
    received.push(args)
  }

  @Command('remind', CommandType.SLASH)
  @Validate(minutes)
  async remind(...args: [ChatInputCommandInteraction, { minutes: number }]) {
    received.push(args)
  }
}

const module = () => MeoCordTestingModule.create({ controllers: [ArgumentsController] }).compile()

describe('a handler receives', () => {
  it('only the message, when it is a listener', async () => {
    const message = createMockMessage({ content: 'anything' })
    await module().invoke(ArgumentsController, 'everything', message as never)

    expect(received).toEqual([[message]])
  })

  it("the message and its pattern's params, when it has a pattern", async () => {
    const message = createMockMessage({ content: 'hi' })
    await module().invoke(ArgumentsController, 'hi', message as never)

    expect(received).toEqual([[message, {}]])
  })

  it('the interaction and its validated input, and nothing more', async () => {
    const interaction = createMockInteraction(ChatInputCommandInteraction, { options: createChatInputOptions({ minutes: '5' }) as never })
    await module().invoke(ArgumentsController, 'remind', interaction)

    expect(received).toHaveLength(1)
    expect(received[0]).toHaveLength(2)
    expect(received[0][1]).toEqual({ minutes: 5 })
  })
})

describe('a pipe without transform', () => {
  it('stops the call with an error naming it and the handler', async () => {
    class Hollow {}

    @Controller()
    class HollowController {
      @Command('hollow', CommandType.SLASH)
      async hollow(_interaction: ChatInputCommandInteraction, _params: { id: string }) {}
    }
    // Applied by hand: @UsePipe's signature already rejects a class without transform() at compile time.
    UsePipe('id', Hollow as never)(HollowController.prototype, 'hollow', Object.getOwnPropertyDescriptor(HollowController.prototype, 'hollow') as never)

    const run = MeoCordTestingModule.create({ controllers: [HollowController] })
      .compile()
      .invoke(HollowController, 'hollow', createMockInteraction(ChatInputCommandInteraction), { id: 'x' })

    await expect(run).rejects.toThrow('Pipe Hollow applied to hollow does not have a valid transform method.')
  })
})
