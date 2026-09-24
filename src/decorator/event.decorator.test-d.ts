import { describe, expectTypeOf, it } from 'vitest'
import { type Client, type GuildMember, type VoiceState } from 'discord.js'
import { On, Once } from '@src/decorator/index.js'
import { type EventHandlerEntry, type HandlerEntry, type HandlerRegistry } from '@src/core/index.js'
import { type TestingModule } from '@src/testing/index.js'

/**
 * Runs under `vitest --typecheck`. The negative cases use `@ts-expect-error`,
 * which fails once the rejected form starts compiling.
 */

describe('@On and @Once', () => {
  it('accept a handler typed from the event, or one taking fewer arguments', () => {
    class Handlers {
      @On('guildMemberAdd')
      greet(member: GuildMember) {
        return member.id
      }

      @On('voiceStateUpdate')
      moved(before: VoiceState, after: VoiceState) {
        return before.channelId === after.channelId
      }

      @Once('clientReady')
      warm() {
        return true
      }

      @Once('clientReady')
      ready(client: Client<true>) {
        return client.user.id
      }
    }
    void Handlers
  })

  it('reject a handler whose parameters do not match the event', () => {
    class Handlers {
      // @ts-expect-error guildMemberAdd passes a GuildMember, not a string
      @On('guildMemberAdd')
      greet(member: string) {
        return member
      }
    }
    void Handlers
  })

  it('reject an event discord.js does not emit', () => {
    class Handlers {
      // @ts-expect-error not a client event
      @On('memberJoined')
      greet() {
        return true
      }
    }
    void Handlers
  })
})

describe('HandlerRegistry.list', () => {
  it('narrows the entries to the kind asked for', () => {
    expectTypeOf<ReturnType<HandlerRegistry['list']>>().toEqualTypeOf<HandlerEntry[]>()
    const events = (null as unknown as HandlerRegistry).list({ kind: 'event' })
    expectTypeOf(events).toEqualTypeOf<EventHandlerEntry[]>()
  })
})

describe('TestingModule.emit', () => {
  it('types the arguments from the event', () => {
    const module = null as unknown as TestingModule
    expectTypeOf(module.emit<'guildMemberAdd'>).parameters.toEqualTypeOf<['guildMemberAdd', GuildMember]>()
  })
})
