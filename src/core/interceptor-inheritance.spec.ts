import { ChatInputCommandInteraction } from 'discord.js'
import { Command, Controller, Interceptor, UseInterceptor } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { type CallHandler, type InterceptorInterface } from '@src/interface/index.js'
import { createMockInteraction, MeoCordTestingModule } from '@src/testing/index.js'

describe('class interceptors on an inherited handler', () => {
  it('come from the class declaring the handler down, never from a class above it', async () => {
    const log: string[] = []

    @Interceptor()
    class Outer implements InterceptorInterface {
      intercept(_context: unknown, next: CallHandler) {
        log.push('grandparent interceptor')
        return next.handle()
      }
    }

    @UseInterceptor(Outer)
    class Grandparent {}

    @Controller()
    class Parent extends Grandparent {
      @Command('plain', CommandType.SLASH)
      async plain(_interaction: ChatInputCommandInteraction) {
        log.push('handler')
      }
    }

    await MeoCordTestingModule.create({ controllers: [Parent] })
      .compile()
      .invoke(Parent, 'plain', createMockInteraction(ChatInputCommandInteraction))

    expect(log).toEqual(['handler'])
  })
})
