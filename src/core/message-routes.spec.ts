import { Controller, MessageHandler } from '@src/decorator/index.js'
import { buildMessageRoutes, matchMessageRoute, parseMessagePattern, type MessageStarts } from '@src/core/message-routes.js'

const RAW: MessageStarts = { prefixes: [''] }

/** The params a pattern captures from content with no prefix, or `undefined` when it does not match. */
function capture(pattern: string, content: string, caseSensitive = false) {
  @Controller()
  class Only {
    @MessageHandler(pattern, { caseSensitive })
    handle() {}
  }
  return matchMessageRoute(buildMessageRoutes([Only]), content, RAW)?.params
}

describe('message patterns', () => {
  it('matches a plain pattern as the whole message, word for word', () => {
    expect(capture('hello', 'hello')).toEqual({})
    expect(capture('hello there', 'hello   there')).toEqual({})
    expect(capture('hello', 'hello there')).toBeUndefined()
    expect(capture('hello there', 'hello')).toBeUndefined()
  })

  it('captures one word per {name}', () => {
    expect(capture('roll {sides}', 'roll 20')).toEqual({ sides: '20' })
    expect(capture('give {user} {amount}', 'give ana 5')).toEqual({ user: 'ana', amount: '5' })
    expect(capture('roll {sides}', 'roll')).toBeUndefined()
    expect(capture('roll {sides}', 'roll 20 30')).toBeUndefined()
  })

  it('takes quoted words as one param, without the quotes, straight or curly', () => {
    expect(capture('tag {name} {value}', 'tag "two words" 5')).toEqual({ name: 'two words', value: '5' })
    expect(capture('tag {name}', 'tag “smart quotes”')).toEqual({ name: 'smart quotes' })
    expect(capture('tag {name}', 'tag ""')).toEqual({ name: '' })
  })

  it('reads an unclosed quote as an ordinary character', () => {
    expect(capture('tag {name} {value}', 'tag "open 5')).toEqual({ name: '"open', value: '5' })
  })

  it('gives {name...} the rest of the message as typed', () => {
    expect(capture('roll {sides} {note...}', 'roll 20 for  "initiative" ok')).toEqual({
      sides: '20',
      note: 'for  "initiative" ok',
    })
    expect(capture('say {text...}', 'say   hi')).toEqual({ text: 'hi' })
    expect(capture('say {text...}', 'say')).toBeUndefined()
  })

  it('leaves out an optional last param the message does not give', () => {
    expect(capture('ban {user} {reason?}', 'ban ana')).toEqual({ user: 'ana' })
    expect(capture('ban {user} {reason?}', 'ban ana spam')).toEqual({ user: 'ana', reason: 'spam' })
    expect(capture('ban {user} {reason?}', 'ban ana spam again')).toBeUndefined()
    expect(capture('ban {user} {reason...?}', 'ban ana')).toEqual({ user: 'ana' })
    expect(capture('ban {user} {reason...?}', 'ban ana spam again')).toEqual({ user: 'ana', reason: 'spam again' })
  })

  it('matches literal words in any case by default, and param values as written', () => {
    expect(capture('roll {sides}', 'ROLL D20')).toEqual({ sides: 'D20' })
    expect(capture('roll {sides}', 'ROLL 20', true)).toBeUndefined()
    expect(capture('Roll {sides}', 'Roll 20', true)).toEqual({ sides: '20' })
  })

  it('refuses a pattern that cannot be read', () => {
    expect(() => parseMessagePattern('say {text...} now')).toThrow(/\{text\.\.\.\} takes the rest of the message, so it must be last/)
    expect(() => parseMessagePattern('give {user} {user}')).toThrow(/\{user\} appears twice/)
    expect(() => parseMessagePattern('ban {reason?} {user}')).toThrow(/\{reason\?\} is optional, so it must be last/)
    expect(() => parseMessagePattern('roll d{sides}')).toThrow(/"d\{sides\}".*a whole word/)
    expect(() => parseMessagePattern('roll {si-des}')).toThrow(/"\{si-des\}".*a whole word/)
  })
})

describe('message route ranking', () => {
  @Controller()
  class Dice {
    @MessageHandler('{anything...}')
    anything() {}

    @MessageHandler('roll {sides} {note...}')
    rollWithNote() {}

    @MessageHandler('roll {sides}')
    roll() {}

    @MessageHandler('roll 20')
    rollTwenty() {}

    @MessageHandler('roll {sides} {times?}')
    rollTimes() {}

    @MessageHandler('{verb} 6')
    anyVerbSix() {}

    @MessageHandler('roll {a} {b}')
    rollTwo() {}
  }

  const routes = buildMessageRoutes([Dice])
  const winner = (content: string) => matchMessageRoute(routes, content, RAW)?.route.method

  it('prefers literal words over params, and more literal words over fewer', () => {
    expect(winner('roll 20')).toBe('rollTwenty')
    expect(winner('roll 12')).toBe('roll')
    expect(winner('hello world')).toBe('anything')
  })

  it('prefers a fixed number of words over the rest, and a given param over an optional one', () => {
    expect(winner('roll 12 3')).toBe('rollTwo')
    expect(winner('roll 12 for luck')).toBe('rollWithNote')
  })

  it('breaks a tie of equal rank by the first word that differs, literal first', () => {
    expect(winner('roll 6')).toBe('roll')
    expect(winner('flip 6')).toBe('anyVerbSix')
  })

  it('ranks across controllers, whatever order they are listed in', () => {
    @Controller()
    class Loose {
      @MessageHandler('roll {sides}')
      loose() {}
    }
    @Controller()
    class Exact {
      @MessageHandler('roll 20')
      exact() {}
    }
    for (const order of [
      [Loose, Exact],
      [Exact, Loose],
    ]) {
      expect(matchMessageRoute(buildMessageRoutes(order), 'roll 20', RAW)?.route.method).toBe('exact')
    }
  })

  it('refuses two patterns that match exactly the same messages', () => {
    @Controller()
    class First {
      @MessageHandler('roll {sides}')
      roll() {}
    }
    @Controller()
    class Second {
      @MessageHandler('ROLL {count}')
      alsoRoll() {}
    }
    expect(() => buildMessageRoutes([First, Second])).toThrow(
      /"roll \{sides\}" in First\.roll and "ROLL \{count\}" in Second\.alsoRoll match the same messages/,
    )
  })

  it('keeps one route for a handler declared under two spellings of one pattern', () => {
    @Controller()
    class Greeting {
      @MessageHandler('hello')
      @MessageHandler('Hello')
      greet() {}
    }
    const routes = buildMessageRoutes([Greeting])
    expect(routes.map(route => route.method)).toEqual(['greet'])
    expect(matchMessageRoute(routes, 'HELLO', RAW)?.route.method).toBe('greet')
  })

  it('tells apart patterns that differ only in case when both are case-sensitive, or in their prefix', () => {
    @Controller()
    class Cased {
      @MessageHandler('Roll', { caseSensitive: true })
      upper() {}

      @MessageHandler('roll', { caseSensitive: true })
      lower() {}

      @MessageHandler('roll', { prefix: '?' })
      question() {}
    }
    expect(() => buildMessageRoutes([Cased], { prefix: '!' })).not.toThrow()
  })

  it('leaves listeners out of the table', () => {
    @Controller()
    class Listener {
      @MessageHandler()
      all() {}
    }
    expect(buildMessageRoutes([Listener])).toEqual([])
  })
})

describe('message starts', () => {
  @Controller()
  class Commands {
    @MessageHandler('roll {sides}')
    roll() {}

    @MessageHandler('hello', { prefix: false })
    hello() {}

    @MessageHandler('ping', { prefix: ['?', '??'] })
    ping() {}

    @MessageHandler('echo {text...}', { caseSensitive: true })
    echo() {}
  }

  const routes = buildMessageRoutes([Commands])
  const match = (content: string, starts: MessageStarts) => {
    const matched = matchMessageRoute(routes, content, starts)
    return matched && [matched.route.method, matched.params]
  }

  it('strips any of the prefixes, the longest first, with or without a space after it', () => {
    const starts: MessageStarts = { prefixes: ['!', 'bot '] }
    expect(match('!roll 20', starts)).toEqual(['roll', { sides: '20' }])
    expect(match('! roll 20', starts)).toEqual(['roll', { sides: '20' }])
    expect(match('bot roll 6', starts)).toEqual(['roll', { sides: '6' }])
    expect(match('roll 20', starts)).toBeUndefined()
    expect(match('!', starts)).toBeUndefined()
  })

  it('matches the prefix in any case unless the handler is case-sensitive', () => {
    expect(match('BOT roll 6', { prefixes: ['bot '] })).toEqual(['roll', { sides: '6' }])
    expect(match('BOT echo hi', { prefixes: ['bot '] })).toBeUndefined()
    expect(match('bot echo Hi', { prefixes: ['bot '] })).toEqual(['echo', { text: 'Hi' }])
  })

  it('accepts a mention of the bot as a start, alongside the prefixes', () => {
    const starts: MessageStarts = { prefixes: ['!'], mention: '111' }
    expect(match('<@111> roll 20', starts)).toEqual(['roll', { sides: '20' }])
    expect(match('<@!111>roll 20', starts)).toEqual(['roll', { sides: '20' }])
    expect(match('!roll 20', starts)).toEqual(['roll', { sides: '20' }])
    expect(match('<@222> roll 20', starts)).toBeUndefined()
  })

  it('keeps unprefixed messages matching when a mention is the only start configured', () => {
    const starts: MessageStarts = { prefixes: [''], mention: '111' }
    expect(match('roll 20', starts)).toEqual(['roll', { sides: '20' }])
    expect(match('<@111> roll 20', starts)).toEqual(['roll', { sides: '20' }])
  })

  it("uses a handler's own prefixes in place of the app's, keeping the mention", () => {
    const starts: MessageStarts = { prefixes: ['!'], mention: '111' }
    expect(match('?ping', starts)).toEqual(['ping', {}])
    expect(match('??ping', starts)).toEqual(['ping', {}])
    expect(match('!ping', starts)).toBeUndefined()
    expect(match('<@111> ping', starts)).toEqual(['ping', {}])
  })

  it('matches a handler with prefix: false against the message as it is, never after a mention', () => {
    const starts: MessageStarts = { prefixes: ['!'], mention: '111' }
    expect(match('hello', starts)).toEqual(['hello', {}])
    expect(match('!hello', starts)).toBeUndefined()
    expect(match('<@111> hello', starts)).toBeUndefined()
  })
})
