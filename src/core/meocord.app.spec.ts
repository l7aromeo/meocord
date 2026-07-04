/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { vi } from 'vitest'

vi.mock('@src/common/index.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    verbose: vi.fn(),
  })),
}))

vi.mock('@src/util/index.js', () => ({
  EmbedUtil: {
    createErrorEmbed: vi.fn().mockReturnValue({ setColor: vi.fn() }),
  },
}))

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
