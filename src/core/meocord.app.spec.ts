/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { vi } from 'vitest'

// Logger is constructed with `new`, so the implementation has to be a class or
// function — vitest 4 refuses to construct an arrow.
vi.mock('@src/common/index.js', () => ({
  Logger: vi.fn(
    class {
      log = vi.fn()
      error = vi.fn()
      warn = vi.fn()
      debug = vi.fn()
      info = vi.fn()
      verbose = vi.fn()
    },
  ),
}))

vi.mock('@src/util/index.js', () => ({
  EmbedUtil: {
    createErrorEmbed: vi.fn().mockReturnValue({ setColor: vi.fn() }),
  },
}))

import { ButtonInteraction } from 'discord.js'
import { Logger } from '@src/common/index.js'
import { createMockInteraction } from '@src/testing/index.js'
import { Command, Controller } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { MeoCordApp } from '@src/core/meocord.app.js'

function createMockClient() {
  const listeners = new Map<string, ((...args: any[]) => any)[]>()

  return {
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event)!.push(handler)
    }),
    login: vi.fn<() => Promise<string>>().mockResolvedValue('token'),
    destroy: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    removeAllListeners: vi.fn(),
    user: { setActivity: vi.fn() },
    application: null,
    emit(event: string, ...args: any[]) {
      listeners.get(event)?.forEach(h => h(...args))
    },
  }
}

function createMockContainer(instanceMap = new Map<any, any>()) {
  return {
    get: vi.fn((cls: any) => instanceMap.get(cls) ?? new cls()),
    isBound: vi.fn().mockReturnValue(false),
  }
}

describe('MeoCordApp', () => {
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    mockClient = createMockClient()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('start()', () => {
    it('registers all required Discord event listeners', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 'token')
      await app.start()

      const registeredEvents = (mockClient.on.mock.calls as [string, any][]).map(([event]) => event)
      expect(registeredEvents).toContain('clientReady')
      expect(registeredEvents).toContain('interactionCreate')
      expect(registeredEvents).toContain('messageCreate')
      expect(registeredEvents).toContain('messageReactionAdd')
      expect(registeredEvents).toContain('messageReactionRemove')
    })

    it('calls bot.login with the provided token', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 'my-secret-token')
      await app.start()
      expect(mockClient.login).toHaveBeenCalledWith('my-secret-token')
    })

    it('starts an activity interval on clientReady', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 'token', [{ name: 'Playing' }])
      await app.start()

      mockClient.emit('clientReady')

      expect(mockClient.user.setActivity).not.toHaveBeenCalled()
      vi.advanceTimersByTime(10000)
      expect(mockClient.user.setActivity).toHaveBeenCalled()
    })
  })

  describe('handleMessage()', () => {
    it('ignores messages from bots', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 'token')
      await app.start()

      mockClient.emit('messageCreate', {
        author: { bot: true },
        content: 'hello',
      })

      // No controllers — just verifying no crash
      expect(mockClient.login).toHaveBeenCalled()
    })

    it('ignores messages with empty content', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 'token')
      await app.start()

      mockClient.emit('messageCreate', {
        author: { bot: false },
        content: '   ',
      })

      expect(mockClient.login).toHaveBeenCalled()
    })
  })

  // A control that is emitted but never routed -- a customId whose value broke its
  // pattern, or a handler nobody wrote -- used to be invisible. The user saw
  // "Command not found!" and the log said nothing about which id failed to match.
  describe('unmatched interactions', () => {
    const unmatchedButton = () => {
      const interaction = createMockInteraction(ButtonInteraction)
      interaction.customId = 'pw-delete-account-999-role-2'
      return interaction
    }

    it('logs the customId that matched no handler', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 'token')
      await app.start()

      mockClient.emit('interactionCreate', unmatchedButton())
      await vi.advanceTimersByTimeAsync(0)

      const warn = vi.mocked(Logger).mock.results[0]?.value.warn
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('pw-delete-account-999-role-2'))
    })

    it('names the @Command pattern as the thing to check', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 'token')
      await app.start()

      mockClient.emit('interactionCreate', unmatchedButton())
      await vi.advanceTimersByTimeAsync(0)

      const warn = vi.mocked(Logger).mock.results[0]?.value.warn
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('@Command'))
    })
  })

  // A parameter matches anything, so a broad route can also match an id that a more
  // literal sibling owns. Which one wins must come from the patterns themselves --
  // relying on registration order would make it depend on file layout.
  describe('overlapping routes', () => {
    const press = (customId: string) => {
      const interaction = createMockInteraction(ButtonInteraction)
      interaction.customId = customId
      return interaction
    }

    const controllers = () => {
      const calls: { handler: string; params: Record<string, string> }[] = []

      @Controller()
      class BroadController {
        @Command('gi-profile/{uuid}/{uid}', CommandType.BUTTON)
        async broad(_i: unknown, params: Record<string, string>) {
          calls.push({ handler: 'broad', params })
        }
      }

      @Controller()
      class SpecificController {
        @Command('gi-profile/summary/{ownerId}/{uid}', CommandType.BUTTON)
        async specific(_i: unknown, params: Record<string, string>) {
          calls.push({ handler: 'specific', params })
        }
      }

      return { BroadController, SpecificController, calls }
    }

    it('gives an id to the route that spells more of it out, however they were declared', async () => {
      for (const broadFirst of [true, false]) {
        const { BroadController, SpecificController, calls } = controllers()
        const order = broadFirst ? [BroadController, SpecificController] : [SpecificController, BroadController]
        const app = new MeoCordApp(order as any, createMockContainer() as any, mockClient as any, 'token')
        await app.start()

        mockClient.emit('interactionCreate', press('gi-profile/summary/123/456'))
        await vi.advanceTimersByTimeAsync(0)

        expect(calls).toEqual([{ handler: 'specific', params: { ownerId: '123', uid: '456' } }])
        mockClient = createMockClient()
      }
    })

    it('still routes an id only the broad pattern can take', async () => {
      const { BroadController, SpecificController, calls } = controllers()
      const app = new MeoCordApp(
        [SpecificController, BroadController] as any,
        createMockContainer() as any,
        mockClient as any,
        'token',
      )
      await app.start()

      mockClient.emit('interactionCreate', press('gi-profile/asjhdasf-asdaf123-sdfasd-xxxx/800000001'))
      await vi.advanceTimersByTimeAsync(0)

      expect(calls).toEqual([{ handler: 'broad', params: { uuid: 'asjhdasf-asdaf123-sdfasd-xxxx', uid: '800000001' } }])
    })
  })

  // `a/{x}/c` and `a/b/{y}` both take `a/b/c`, and neither is more literal than the
  // other, so ranking cannot settle it. Saying so at startup beats letting one of
  // them quietly win every click.
  describe('ambiguous routes', () => {
    it('warns about a pair that trades a literal for a parameter in each direction', async () => {
      @Controller()
      class AmbiguousController {
        @Command('a/{x}/c', CommandType.BUTTON)
        async one(..._args: any[]) {}

        @Command('a/b/{y}', CommandType.BUTTON)
        async two(..._args: any[]) {}
      }

      const app = new MeoCordApp([AmbiguousController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit('interactionCreate', createMockInteraction(ButtonInteraction))
      await vi.advanceTimersByTimeAsync(0)

      const warn = vi.mocked(Logger).mock.results[0]?.value.warn
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('can match the same customId'))
    })

    it('stays quiet when the patterns cannot collide', async () => {
      @Controller()
      class DistinctController {
        @Command('profile/{uuid}', CommandType.BUTTON)
        async one(..._args: any[]) {}

        @Command('profile/{uuid}/{id}', CommandType.BUTTON)
        async two(..._args: any[]) {}
      }

      const app = new MeoCordApp([DistinctController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit('interactionCreate', createMockInteraction(ButtonInteraction))
      await vi.advanceTimersByTimeAsync(0)

      const warn = vi.mocked(Logger).mock.results[0]?.value.warn
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('can match the same customId'))
    })
  })

  describe('gracefulShutdown()', () => {
    it('destroys the client and clears the activity interval', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 'token', [{ name: 'Playing' }])
      await app.start()

      mockClient.emit('clientReady')
      vi.advanceTimersByTime(10000)

      const sigintHandler = process.listeners('SIGINT').at(-1) as () => Promise<void>
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

      await sigintHandler()

      expect(mockClient.destroy).toHaveBeenCalled()
      expect(mockClient.removeAllListeners).toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalledWith(0)

      exitSpy.mockRestore()
    })
  })
})
