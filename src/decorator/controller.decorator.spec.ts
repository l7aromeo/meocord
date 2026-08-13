/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import {
  Command,
  Controller,
  findAmbiguousRoutes,
  getCommandMap,
  getMessageHandlers,
  getReactionHandlers,
  MessageHandler,
  ReactionHandler,
} from '@src/decorator/controller.decorator.js'
import { CommandType, MetadataKey } from '@src/enum/index.js'

describe('@MessageHandler', () => {
  it('registers a handler with a keyword', () => {
    class TestController {
      @MessageHandler('hello')
      handleHello(..._args: any[]) {}
    }

    const handlers = getMessageHandlers(TestController.prototype)
    expect(handlers).toHaveLength(1)
    expect(handlers[0]).toEqual({ keyword: 'hello', method: 'handleHello' })
  })

  it('registers a handler without a keyword', () => {
    class TestController {
      @MessageHandler()
      handleAny(..._args: any[]) {}
    }

    const handlers = getMessageHandlers(TestController.prototype)
    expect(handlers[0].keyword).toBeUndefined()
    expect(handlers[0].method).toBe('handleAny')
  })

  it('registers multiple handlers on the same class', () => {
    class TestController {
      @MessageHandler('hello')
      handleHello(..._args: any[]) {}

      @MessageHandler('bye')
      handleBye(..._args: any[]) {}
    }

    expect(getMessageHandlers(TestController.prototype)).toHaveLength(2)
  })
})

describe('@ReactionHandler', () => {
  it('registers a handler with an emoji', () => {
    class TestController {
      @ReactionHandler('👍')
      handleThumbsUp(..._args: any[]) {}
    }

    const handlers = getReactionHandlers(TestController.prototype)
    expect(handlers[0]).toEqual({ emoji: '👍', method: 'handleThumbsUp' })
  })

  it('registers a handler without an emoji', () => {
    class TestController {
      @ReactionHandler()
      handleAny(..._args: any[]) {}
    }

    const handlers = getReactionHandlers(TestController.prototype)
    expect(handlers[0].emoji).toBeUndefined()
    expect(handlers[0].method).toBe('handleAny')
  })

  it('registers multiple reaction handlers', () => {
    class TestController {
      @ReactionHandler('👍')
      handleLike(..._args: any[]) {}

      @ReactionHandler('👎')
      handleDislike(..._args: any[]) {}
    }

    expect(getReactionHandlers(TestController.prototype)).toHaveLength(2)
  })
})

describe('@Command', () => {
  it('registers a SLASH command with the correct type and method name', () => {
    class TestController {
      @Command('ping', CommandType.SLASH)
      ping(..._args: any[]) {}
    }

    const commandMap = getCommandMap(TestController.prototype)
    expect(commandMap['ping']).toBeDefined()
    expect(commandMap['ping'][0].type).toBe(CommandType.SLASH)
    expect(commandMap['ping'][0].methodName).toBe('ping')
  })

  it('registers a BUTTON command with a regex pattern', () => {
    class TestController {
      @Command('btn/{id}', CommandType.BUTTON)
      handleBtn(..._args: any[]) {}
    }

    const commandMap = getCommandMap(TestController.prototype)
    const meta = commandMap['btn/{id}'][0]
    expect(meta.regex).toBeInstanceOf(RegExp)
    expect(meta.dynamicParams).toContain('id')
  })

  it('matches dynamic BUTTON command IDs correctly', () => {
    class TestController {
      @Command('profile/{userId}', CommandType.BUTTON)
      handleProfile(..._args: any[]) {}
    }

    const { regex } = getCommandMap(TestController.prototype)['profile/{userId}'][0]
    expect(regex!.test('profile/12345')).toBe(true)
    expect(regex!.test('profile/abc')).toBe(true)
    expect(regex!.test('profile/')).toBe(false)
    expect(regex!.test('other/12345')).toBe(false)
  })

  // A parameter stops at `/`, the same rule Express and Rails use for a path segment.
  // That is what lets a uuid be captured whole -- a hyphen inside it is data, not
  // structure -- and what keeps neighbouring patterns from taking each other's ids.
  describe('parameter matching', () => {
    const regexFor = (pattern: string) => {
      class TestController {
        @Command(pattern, CommandType.BUTTON)
        handle(..._args: any[]) {}
      }
      return getCommandMap(TestController.prototype)[pattern][0].regex!
    }

    it('captures a value containing hyphens', () => {
      expect(regexFor('profile/{uuid}').exec('profile/8400e29b-41d4-a716')?.groups).toEqual({
        uuid: '8400e29b-41d4-a716',
      })
    })

    it('captures dots, underscores and colons', () => {
      expect(regexFor('k/{key}').exec('k/a.b_c:d')?.groups?.key).toBe('a.b_c:d')
    })

    it('stops a parameter at the separator', () => {
      expect(regexFor('profile/{uuid}').test('profile/abc/123')).toBe(false)
    })

    it('keeps a hyphenated value out of the following parameter', () => {
      expect(regexFor('profile/{uuid}/{id}').exec('profile/8400e29b-41d4-a716/99')?.groups).toEqual({
        uuid: '8400e29b-41d4-a716',
        id: '99',
      })
    })

    it('still requires a parameter to capture something', () => {
      expect(regexFor('profile/{userId}').test('profile/')).toBe(false)
    })

    it('does not let a shorter pattern take a longer id', () => {
      expect(regexFor('profile/{uuid}').test('profile/abc/123')).toBe(false)
      expect(regexFor('profile/{uuid}/{id}').test('profile/abc')).toBe(false)
    })
  })

  // A parameter that shares a segment with a literal has no boundary a sibling can be
  // told apart by: `profile-{uuid}` and `profile-{uuid}-{id}` both take `profile-a-b`.
  // Rejecting the shape at registration is the only point where it can still be fixed.
  describe('segment validation', () => {
    const declare = (pattern: string) => () => {
      class TestController {
        @Command(pattern, CommandType.BUTTON)
        handle(..._args: any[]) {}
      }
      return TestController
    }

    it('rejects a parameter preceded by anything but the separator', () => {
      expect(declare('profile-{uuid}')).toThrow(/segment/i)
    })

    it('rejects a parameter followed by anything but the separator', () => {
      expect(declare('profile/{uuid}-suffix')).toThrow(/segment/i)
    })

    it('rejects two parameters sharing a segment', () => {
      expect(declare('{a}-{b}')).toThrow(/segment/i)
    })

    it('names the offending parameter and the pattern', () => {
      expect(declare('gi-profile-{ownerId}-{uid}')).toThrow(/ownerId/)
      expect(declare('gi-profile-{ownerId}-{uid}')).toThrow(/gi-profile-\{ownerId}-\{uid}/)
    })

    it('accepts a parameter occupying a whole segment', () => {
      expect(declare('profile/{uuid}')).not.toThrow()
      expect(declare('profile/{uuid}/{id}')).not.toThrow()
    })

    it('accepts a hyphen inside a literal segment', () => {
      expect(declare('gi-profile/{ownerId}/{uid}')).not.toThrow()
    })

    it('accepts a pattern that is only a parameter', () => {
      expect(declare('{uuid}')).not.toThrow()
    })

    it('accepts a parameter between literal segments', () => {
      expect(declare('a/{b}/c')).not.toThrow()
    })

    it('leaves patterns without parameters alone', () => {
      expect(declare('gi-profile-static')).not.toThrow()
    })
  })

  describe('specificity', () => {
    const rank = (pattern: string) => {
      class TestController {
        @Command(pattern, CommandType.BUTTON)
        handle(..._args: any[]) {}
      }
      return getCommandMap(TestController.prototype)[pattern][0].specificity!
    }

    it('ranks the pattern spelling out more of the id above the one leaving it to a parameter', () => {
      expect(rank('profile/summary/{ownerId}/{uid}')).toBeGreaterThan(rank('profile/{uuid}/{uid}'))
    })

    it('breaks a tie between equal-length patterns by parameter count', () => {
      expect(rank('abcd/{a}')).toBeGreaterThan(rank('abc/{a}/{b}'))
    })
  })

  // Different segment counts cannot collide, and neither can segments whose literals
  // differ. What is left is a pair like `a/{x}/c` and `a/b/{y}`: both take `a/b/c`,
  // and neither is more literal than the other, so ranking cannot settle it.
  describe('findAmbiguousRoutes', () => {
    it('reports a pair that trades a literal for a parameter in each direction', () => {
      expect(findAmbiguousRoutes(['a/{x}/c', 'a/b/{y}'])).toEqual([['a/{x}/c', 'a/b/{y}']])
    })

    it('clears patterns of different segment counts', () => {
      expect(findAmbiguousRoutes(['profile/{uuid}', 'profile/{uuid}/{id}'])).toEqual([])
    })

    it('clears patterns whose literals differ', () => {
      expect(findAmbiguousRoutes(['profile/{uuid}', 'settings/{uuid}'])).toEqual([])
    })

    it('reports a broad pattern against a literal sibling of the same shape', () => {
      expect(findAmbiguousRoutes(['profile/summary/{uid}', 'profile/{uuid}/{uid}'])).toEqual([
        ['profile/summary/{uid}', 'profile/{uuid}/{uid}'],
      ])
    })

    it('reports each pair once rather than in both orders', () => {
      expect(findAmbiguousRoutes(['a/{x}', 'a/{y}', 'a/{z}'])).toHaveLength(3)
    })

    it('returns nothing for a single pattern', () => {
      expect(findAmbiguousRoutes(['profile/{uuid}'])).toEqual([])
    })

    it('returns nothing for no patterns', () => {
      expect(findAmbiguousRoutes([])).toEqual([])
    })
  })

  it('registers multiple commands on the same class', () => {
    class TestController {
      @Command('ping', CommandType.SLASH)
      ping(..._args: any[]) {}

      @Command('pong', CommandType.SLASH)
      pong(..._args: any[]) {}
    }

    const commandMap = getCommandMap(TestController.prototype)
    expect(commandMap['ping']).toBeDefined()
    expect(commandMap['pong']).toBeDefined()
  })

  it('does not create a regex for SLASH commands', () => {
    class TestController {
      @Command('ping', CommandType.SLASH)
      ping(..._args: any[]) {}
    }

    const meta = getCommandMap(TestController.prototype)['ping'][0]
    expect(meta.regex).toBeUndefined()
  })
})

describe('@Controller', () => {
  it('makes the class inversify-injectable', () => {
    @Controller()
    class TestController {}

    expect(Reflect.getMetadata(MetadataKey.Injectable, TestController)).toBe(true)
  })

  it('does not throw when applied to an already-injectable class', () => {
    @Controller()
    class TestController {}

    expect(() => Controller()(TestController)).not.toThrow()
  })
})

describe('getMessageHandlers', () => {
  it('returns empty array for a class with no handlers', () => {
    class NoHandlers {}
    expect(getMessageHandlers(NoHandlers.prototype)).toEqual([])
  })
})

describe('getReactionHandlers', () => {
  it('returns empty array for a class with no handlers', () => {
    class NoHandlers {}
    expect(getReactionHandlers(NoHandlers.prototype)).toEqual([])
  })
})
