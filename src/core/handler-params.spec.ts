import { ButtonInteraction, type GuildMember, Message } from 'discord.js'
import { Catch, Command, Controller, Guard, Interceptor, MessageHandler, On, Pipe, UseFilter, UseGuard, UseInterceptor, UsePipe, Validate } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { ExecutionContext } from '@src/common/index.js'
import {
  type CallHandler,
  type ExceptionFilter,
  type GuardInterface,
  type InterceptorInterface,
  type PipeInterface,
  type StandardSchemaV1,
} from '@src/interface/index.js'
import { createMockInteraction, MeoCordTestingModule } from '@src/testing/index.js'

/** What each stage read from `getHandlerParams()`, and `getParams()` where it has its own. */
const seen: [stage: string, value: unknown][] = []

/** Whether `getArgs()[1]` was the very value `getHandlerParams()` returned, stage by stage. */
const agreed: [stage: string, same: boolean][] = []
const check = (stage: string, context: ExecutionContext) =>
  agreed.push([stage, context.getArgs()[1] === context.getHandlerParams()])

// Trims, so a stage can tell validated params from raw ones
const trimmed: StandardSchemaV1<unknown, { uid: string }> = {
  '~standard': { version: 1, vendor: 'test', validate: value => ({ value: { uid: String((value as { uid: string }).uid).trim() } }) },
}

class Account {
  constructor(readonly uid: string) {}
}

@Pipe()
class AccountPipe implements PipeInterface<string, Account> {
  transform(uid: string): Account {
    return new Account(uid)
  }
}

@Guard()
class RecordingGuard implements GuardInterface {
  constructor(private readonly context: ExecutionContext) {}

  canActivate(): boolean {
    seen.push(['guard', this.context.getHandlerParams()])
    check('guard', this.context)
    seen.push(['guard getParams', this.context.getParams()])
    return true
  }
}

@Interceptor()
class RecordingInterceptor implements InterceptorInterface {
  async intercept(context: ExecutionContext, next: CallHandler) {
    seen.push(['interceptor before', context.getHandlerParams()])
    check('interceptor before', context)
    const result = await next.handle()
    seen.push(['interceptor after', context.getHandlerParams()])
    check('interceptor after', context)
    return result
  }
}

class Boom extends Error {}

@Catch(Boom)
class RecordingFilter implements ExceptionFilter<Boom> {
  catch(_error: Boom, context: ExecutionContext): void {
    seen.push(['filter', context.getHandlerParams()])
    check('filter', context)
  }
}

@Controller()
class ProfileController {
  @Command('profile/{uid}', CommandType.BUTTON)
  @UseGuard({ provide: RecordingGuard, params: { role: 'staff' } })
  @UseInterceptor(RecordingInterceptor)
  @Validate(trimmed, { pipes: { uid: AccountPipe } })
  async show(_interaction: ButtonInteraction, _params: { uid: Account }) {}

  @Command('broken/{uid}', CommandType.BUTTON)
  @UseFilter(RecordingFilter)
  @UsePipe('uid', AccountPipe)
  async broken(_interaction: ButtonInteraction, _params: { uid: Account }) {
    throw new Boom()
  }

  @MessageHandler('!hi')
  @UseInterceptor(RecordingInterceptor)
  async hi(_message: Message) {}

  @On('guildMemberAdd')
  @UseInterceptor(RecordingInterceptor)
  async welcome(_member: GuildMember) {}
}

const press = (customId: string) => createMockInteraction(ButtonInteraction, { customId })

beforeEach(() => {
  seen.length = 0
  agreed.length = 0
})

describe('ExecutionContext.getHandlerParams()', () => {
  const module = MeoCordTestingModule.create({ controllers: [ProfileController] }).compile()

  it('gives a guard the raw params, beside the guard’s own params from getParams()', async () => {
    await module.invoke(ProfileController, 'show', press('profile/ 800000001 '))

    expect(seen.slice(0, 2)).toEqual([
      ['guard', { uid: ' 800000001 ' }],
      ['guard getParams', { role: 'staff' }],
    ])
  })

  it('gives an interceptor the params as they stand: raw before next.handle(), validated and piped after', async () => {
    await module.invoke(ProfileController, 'show', press('profile/ 800000001 '))

    expect(seen.slice(2)).toEqual([
      ['interceptor before', { uid: ' 800000001 ' }],
      ['interceptor after', { uid: new Account('800000001') }],
    ])
  })

  it('gives a filter the params after the pipes ran', async () => {
    await module.invoke(ProfileController, 'broken', press('broken/800000001'))

    expect(seen).toEqual([['filter', { uid: new Account('800000001') }]])
  })

  it('agrees with getArgs() at every stage, the second argument being the same value', async () => {
    await module.invoke(ProfileController, 'show', press('profile/ 800000001 '))
    await module.invoke(ProfileController, 'broken', press('broken/800000001'))

    expect(agreed).toEqual([
      ['guard', true],
      ['interceptor before', true],
      ['interceptor after', true],
      ['filter', true],
    ])
  })

  it('is undefined where the handler takes no params: messages and gateway events', async () => {
    const message = Object.assign(Object.create(Message.prototype) as Message, { content: '!hi', author: { id: 'ada', bot: false } })

    await module.invoke(ProfileController, 'hi', message)
    await module.emit('guildMemberAdd', {} as GuildMember)

    expect(seen).toEqual([
      ['interceptor before', undefined],
      ['interceptor after', undefined],
      ['interceptor before', undefined],
      ['interceptor after', undefined],
    ])
  })
})
