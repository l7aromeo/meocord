/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import {
  Command,
  Controller,
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
      @Command('btn-{id}', CommandType.BUTTON)
      handleBtn(..._args: any[]) {}
    }

    const commandMap = getCommandMap(TestController.prototype)
    const meta = commandMap['btn-{id}'][0]
    expect(meta.regex).toBeInstanceOf(RegExp)
    expect(meta.dynamicParams).toContain('id')
  })

  it('matches dynamic BUTTON command IDs correctly', () => {
    class TestController {
      @Command('profile-{userId}', CommandType.BUTTON)
      handleProfile(..._args: any[]) {}
    }

    const { regex } = getCommandMap(TestController.prototype)['profile-{userId}'][0]
    expect(regex!.test('profile-12345')).toBe(true)
    expect(regex!.test('profile-abc')).toBe(true)
    expect(regex!.test('profile-')).toBe(false)
    expect(regex!.test('other-12345')).toBe(false)
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
