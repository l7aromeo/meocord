import { describe, it } from 'vitest'
import { type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js'
import { type ExecutionContext } from '@src/common/index.js'
import { Catch, Guard, Interceptor, MeoCord, Pipe, UseFilter, UseGuard, UseInterceptor, UsePipe } from '@src/decorator/index.js'
import {
  type CallHandler,
  type ExceptionFilter,
  type GuardInterface,
  type InterceptorInterface,
  type PipeInterface,
  type StageParams,
} from '@src/interface/index.js'

/**
 * Runs under `vitest --typecheck`: `{ provide, params }` is checked against the params a class declares
 * with `declare readonly params?: P`. The negative cases use `@ts-expect-error`, which fails once the
 * rejected form starts compiling.
 */

class Channels {
  list(): string[] {
    return []
  }
}

@Guard()
class ChannelGuard implements GuardInterface {
  declare readonly params?: { channelIds: string[]; mode?: 'allow' | 'deny' }

  canActivate(interaction: ChatInputCommandInteraction): boolean {
    return this.params?.channelIds.includes(interaction.channelId) ?? false
  }
}

// A public injected service is no param: without a declaration, params stay untyped
@Guard()
class ServiceGuard implements GuardInterface {
  constructor(readonly channels: Channels) {}

  canActivate(): boolean {
    return this.channels.list().length > 0
  }
}

@Interceptor()
class TimeoutInterceptor implements InterceptorInterface {
  declare readonly params?: { ms: number }

  intercept(context: ExecutionContext, next: CallHandler) {
    const { ms } = context.getParams<StageParams<typeof TimeoutInterceptor>>() ?? { ms: 3000 }
    void ms
    return next.handle()
  }
}

@Catch()
class ReportFilter implements ExceptionFilter {
  declare readonly params?: { channel: string }

  catch(): void {
    return undefined
  }
}

@Pipe()
class TrimPipe implements PipeInterface<string, string> {
  declare readonly params?: { max: number }

  transform(value: string): string {
    return value.trim()
  }
}

describe('declared params', () => {
  it('checks a guard entry against the params its guard declares', () => {
    UseGuard({ provide: ChannelGuard, params: { channelIds: ['1'] } }, { provide: ChannelGuard, params: { channelIds: [], mode: 'deny' } }, ChannelGuard)
    const OnlyIn = (...channelIds: string[]) => UseGuard({ provide: ChannelGuard, params: { channelIds } })
    void OnlyIn

    // @ts-expect-error `channelId` is not a declared param
    UseGuard({ provide: ChannelGuard, params: { channelId: '1' } })
    // @ts-expect-error `channelIds` is a list
    UseGuard({ provide: ChannelGuard, params: { channelIds: '1' } })
    // @ts-expect-error `extra` is not a declared param
    UseGuard({ provide: ChannelGuard, params: { channelIds: [], extra: true } })
  })

  it('leaves a class without the declaration untyped, a public injected service included', () => {
    UseGuard({ provide: ServiceGuard, params: { anything: 1 } })
  })

  it('checks interceptors, filters and pipes the same way', () => {
    UseInterceptor({ provide: TimeoutInterceptor, params: { ms: 500 } })
    UseFilter({ provide: ReportFilter, params: { channel: 'ops' } })
    UsePipe('name', { provide: TrimPipe, params: { max: 32 } })

    // @ts-expect-error `ms` is a number
    UseInterceptor({ provide: TimeoutInterceptor, params: { ms: '500' } })
    // @ts-expect-error `chanel` is not a declared param
    UseFilter({ provide: ReportFilter, params: { chanel: 'ops' } })
    // @ts-expect-error `maximum` is not a declared param
    UsePipe('name', { provide: TrimPipe, params: { maximum: 32 } })
  })

  it("checks @MeoCord's global guards, interceptors and filters", () => {
    @MeoCord({
      controllers: [],
      clientOptions: { intents: [] },
      guards: [ServiceGuard, { provide: ChannelGuard, params: { channelIds: ['1'] } }],
      interceptors: [{ provide: TimeoutInterceptor, params: { ms: 500 } }],
      filters: [ReportFilter],
    })
    class App {}
    void App

    // @ts-expect-error `channelId` is not a declared param
    @MeoCord({ controllers: [], clientOptions: { intents: [] }, guards: [{ provide: ChannelGuard, params: { channelId: '1' } }] })
    class Misspelt {}
    void Misspelt
  })
})

void (null as unknown as ButtonInteraction)
