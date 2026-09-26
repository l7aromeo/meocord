import { type Message } from 'discord.js'
import {
  Catch,
  Controller,
  Cooldown,
  Guard,
  Interceptor,
  MessageHandler,
  Observer,
  UseFilter,
  UseGuard,
  UseInterceptor,
  Validate,
} from '@src/decorator/index.js'
import { type ExecutionContext } from '@src/common/index.js'
import {
  type CallHandler,
  type DispatchObserver,
  type DispatchResult,
  type ExceptionFilter,
  type GuardInterface,
  type InterceptorInterface,
  type StandardSchemaV1,
} from '@src/interface/index.js'
import { type AdmittedCall, runHandler, type RunOptions } from '@src/core/handler-pipeline.js'
import { createMockMessage, MeoCordTestingModule, type TestingModule } from '@src/testing/index.js'

const seen: unknown[] = []

class NotFound extends Error {}

@Guard()
class AllowUnlessDenied implements GuardInterface {
  canActivate(message: Message) {
    seen.push(['guard', message.content])
    return message.content !== 'deny'
  }
}

@Interceptor()
class Recorder implements InterceptorInterface {
  async intercept(context: ExecutionContext, next: CallHandler) {
    seen.push(['interceptor', context.getHandlerParams()])
    try {
      return await next.handle()
    } catch (error) {
      seen.push(['interceptor saw', (error as Error).message])
      throw error
    }
  }
}

@Catch(NotFound)
class NotFoundFilter implements ExceptionFilter<NotFound> {
  catch(error: NotFound) {
    seen.push(['filter', error.message])
  }
}

@Observer()
class Outcomes implements DispatchObserver {
  onSettled(_context: ExecutionContext, { outcome }: DispatchResult) {
    seen.push(['outcome', outcome])
  }
}

const amount: StandardSchemaV1<unknown, { amount: number }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: value => ({ value: { amount: Number((value as { amount: string }).amount) } }),
  },
}

@Controller()
class Payments {
  @MessageHandler('pay {amount}')
  @UseGuard(AllowUnlessDenied)
  @UseInterceptor(Recorder)
  @UseFilter(NotFoundFilter)
  @Validate(amount)
  @Cooldown({ uses: 1, seconds: 60 })
  pay(_message: Message, params: { amount: number }) {
    seen.push(['handler', params])
  }
}

/** Runs `pay` as dispatch runs a message handler, with the parsed params and the given fetch. */
async function run(module: TestingModule, content: string, fetchArgs?: RunOptions['fetchArgs']) {
  await module.init()
  const message = createMockMessage({ content })
  Object.assign(message.author, { id: 'user-1' })
  return runHandler(Reflect.get(module, 'container'), module.get(Payments) as never, 'pay', [message, { amount: '5' }], {
    fetchArgs,
    awaitObservers: true,
  })
}

const compile = () => MeoCordTestingModule.create({ controllers: [Payments], observers: [Outcomes] }).compile()

beforeEach(() => {
  seen.length = 0
})

describe('fetchArgs', () => {
  it('runs after the guards admit the call, and every later stage and the handler see what it returns', async () => {
    const admitted: AdmittedCall[] = []

    const outcome = await run(compile(), 'pay', async ([message], call) => {
      seen.push(['fetch'])
      admitted.push(call)
      return [message, { amount: '7' }]
    })

    expect(outcome).toEqual({ ran: true })
    expect(seen).toEqual([
      ['guard', 'pay'],
      ['fetch'],
      ['interceptor', { amount: '7' }],
      ['handler', { amount: 7 }],
      ['outcome', 'ran'],
    ])
    await expect(admitted[0].checkCooldowns()).resolves.toBeUndefined()
  })

  it('never runs for a call the guards deny', async () => {
    const fetchArgs = vi.fn(async (args: unknown[]) => args)

    const outcome = await run(compile(), 'deny', fetchArgs)

    expect(outcome).toEqual({ ran: false })
    expect(fetchArgs).not.toHaveBeenCalled()
    expect(seen).toEqual([
      ['guard', 'deny'],
      ['outcome', 'denied'],
    ])
  })

  it('hands what it throws to the handler\'s filters, outside the interceptors, and counts no cooldown', async () => {
    const module = compile()

    const failed = await run(module, 'pay', async () => {
      throw new NotFound('no such member')
    })
    seen.length = 0
    const next = await run(module, 'pay', async args => args)

    expect(failed).toEqual({ ran: false, error: expect.any(NotFound) })
    // The cooldown allows one use a minute: the failed fetch did not take it
    expect(next).toEqual({ ran: true })
    expect(seen).toEqual([
      ['guard', 'pay'],
      ['interceptor', { amount: '5' }],
      ['handler', { amount: 5 }],
      ['outcome', 'ran'],
    ])
  })

  it('reports a call that fails in it as an error, its filter having handled it', async () => {
    await run(compile(), 'pay', async () => {
      throw new NotFound('no such member')
    })

    expect(seen).toEqual([
      ['guard', 'pay'],
      ['filter', 'no such member'],
      ['outcome', 'error'],
    ])
  })
})
