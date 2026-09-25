import { describe, it } from 'vitest'
import { type Message } from 'discord.js'
import { MeoCord, MessageHandler } from '@src/decorator/index.js'

/** Runs under `vitest --typecheck`: what `@MessageHandler` and `@MeoCord({ messages })` accept. */

describe('@MessageHandler params', () => {
  it('passes a patterned handler its params as the second argument, typed by the handler', () => {
    class Dice {
      @MessageHandler('roll {sides} {note...?}')
      async roll(_message: Message, _params: { sides: string; note?: string }) {
        return undefined
      }

      @MessageHandler('roll {sides}')
      async validated(_message: Message, _params: { sides: number }) {
        return undefined
      }

      @MessageHandler('roll {sides}')
      async messageOnly(_message: Message) {
        return undefined
      }

      @MessageHandler('roll {sides}')
      async none() {
        return undefined
      }

      // @ts-expect-error params are an object
      @MessageHandler('roll {sides}')
      async notAnObject(_message: Message, _params: string) {
        return undefined
      }
    }
    void Dice
  })

  it('passes a listener the message alone', () => {
    class Listener {
      @MessageHandler()
      async everything(_message: Message) {
        return undefined
      }

      // @ts-expect-error a listener has no pattern, so no params
      @MessageHandler()
      async withParams(_message: Message, _params: { sides: string }) {
        return undefined
      }
    }
    void Listener
  })

  it("takes a handler's own prefix and case rule", () => {
    class Options {
      @MessageHandler('hello', { prefix: false })
      async raw() {
        return undefined
      }

      @MessageHandler('ping', { prefix: '?' })
      async one() {
        return undefined
      }

      @MessageHandler('ping', { prefix: ['?', '??'], caseSensitive: true })
      async many() {
        return undefined
      }

      // @ts-expect-error prefix is false, a string or a list of strings
      @MessageHandler('ping', { prefix: true })
      async wrong() {
        return undefined
      }

      // @ts-expect-error a handler's prefix is fixed; only the app's may be a function
      @MessageHandler('ping', { prefix: () => '!' })
      async fn() {
        return undefined
      }
    }
    void Options
  })
})

describe('@MeoCord({ messages })', () => {
  it('takes prefixes as a string, a list, or a function of the message', () => {
    @MeoCord({ controllers: [], clientOptions: { intents: [] }, messages: { prefix: '!', mention: true, caseSensitive: false } })
    class One {}

    @MeoCord({ controllers: [], clientOptions: { intents: [] }, messages: { prefix: ['!', '?'] } })
    class Many {}

    @MeoCord({
      controllers: [],
      clientOptions: { intents: [] },
      messages: { prefix: async (message: Message) => (message.guildId ? ['?'] : '!') },
    })
    class PerGuild {}

    // @ts-expect-error a prefix is text
    @MeoCord({ controllers: [], clientOptions: { intents: [] }, messages: { prefix: 1 } })
    class Wrong {}

    void [One, Many, PerGuild, Wrong]
  })
})
