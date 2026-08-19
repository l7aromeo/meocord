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

import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  MentionableSelectMenuInteraction,
  MessageReaction,
  PrimaryEntryPointCommandInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
  User,
  UserSelectMenuInteraction,
} from 'discord.js'
import { Logger } from '@src/common/index.js'
import { EmbedUtil } from '@src/util/index.js'
import { createChatInputOptions, createMockInteraction } from '@src/testing/index.js'
import { Autocomplete, Command, Controller, ReactionHandler } from '@src/decorator/index.js'
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
    // `emit` deliberately drops the returned promise, the way an EventEmitter does.
    // Awaiting a listener directly is what proves it settles rather than rejecting
    // into nothing.
    listenersFor(event: string) {
      return listeners.get(event) ?? []
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

  // Discord sends the four entity select menus as distinct component types carrying
  // different resolved data. Routing them all as "a select menu" -- or not at all --
  // answered a working component with "Command not found!".
  describe('component dispatch', () => {
    const componentCases: [CommandType, { prototype: any; name: string }][] = [
      [CommandType.SELECT_MENU, StringSelectMenuInteraction],
      [CommandType.USER_SELECT_MENU, UserSelectMenuInteraction],
      [CommandType.ROLE_SELECT_MENU, RoleSelectMenuInteraction],
      [CommandType.MENTIONABLE_SELECT_MENU, MentionableSelectMenuInteraction],
      [CommandType.CHANNEL_SELECT_MENU, ChannelSelectMenuInteraction],
    ]

    it.each(componentCases)('routes %s to its handler with the pattern params', async (type, InteractionClass) => {
      const calls: Record<string, string>[] = []

      @Controller()
      class SelectController {
        @Command('pick/{scope}', type)
        async handle(_interaction: unknown, params: Record<string, string>) {
          calls.push(params)
        }
      }

      const app = new MeoCordApp([SelectController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      const interaction = createMockInteraction(InteractionClass, { customId: 'pick/guild' })
      mockClient.emit('interactionCreate', interaction)
      await vi.advanceTimersByTimeAsync(0)

      expect(calls).toEqual([{ scope: 'guild' }])
    })

    // A button and a select menu may legitimately share a customId shape. Matching on
    // the pattern alone would let whichever ranked first swallow the other's clicks.
    it('tells two components apart when they share a pattern', async () => {
      const calls: string[] = []

      @Controller()
      class SharedController {
        @Command('shared/{id}', CommandType.BUTTON)
        async button(..._args: any[]) {
          calls.push('button')
        }

        @Command('shared/{id}', CommandType.CHANNEL_SELECT_MENU)
        async select(..._args: any[]) {
          calls.push('select')
        }
      }

      const app = new MeoCordApp([SharedController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit(
        'interactionCreate',
        createMockInteraction(ChannelSelectMenuInteraction, { customId: 'shared/7' }),
      )
      await vi.advanceTimersByTimeAsync(0)

      expect(calls).toEqual(['select'])
    })

    it('does not warn about an overlap between two different component types', async () => {
      @Controller()
      class SharedController {
        @Command('shared/{id}', CommandType.BUTTON)
        async button(..._args: any[]) {}

        @Command('shared/{id}', CommandType.SELECT_MENU)
        async select(..._args: any[]) {}
      }

      const app = new MeoCordApp([SharedController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit('interactionCreate', createMockInteraction(ButtonInteraction, { customId: 'shared/7' }))
      await vi.advanceTimersByTimeAsync(0)

      const warn = vi.mocked(Logger).mock.results[0]?.value.warn
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('can match the same customId'))
    })
  })

  // Discord sends `/settings notify email` as one interaction named `settings`, so a
  // command whose subcommands live in separate methods used to run whichever method was
  // declared first.
  describe('slash command dispatch', () => {
    const invoke = (commandName: string, options: Parameters<typeof createChatInputOptions>[0] = {}) => {
      const interaction = createMockInteraction(ChatInputCommandInteraction, { commandName })
      interaction.options = createChatInputOptions(options)
      return interaction
    }

    const controllers = () => {
      const calls: { handler: string; params: Record<string, unknown> }[] = []

      @Controller()
      class ParentController {
        @Command('settings', CommandType.SLASH)
        async parent(_i: unknown, params: Record<string, unknown>) {
          calls.push({ handler: 'parent', params })
        }
      }

      @Controller()
      class SubController {
        @Command('settings notify email', CommandType.SLASH)
        async sub(_i: unknown, params: Record<string, unknown>) {
          calls.push({ handler: 'sub', params })
        }
      }

      return { ParentController, SubController, calls }
    }

    it('gives a subcommand to its own handler, however the controllers were registered', async () => {
      for (const parentFirst of [true, false]) {
        const { ParentController, SubController, calls } = controllers()
        const order = parentFirst ? [ParentController, SubController] : [SubController, ParentController]
        const app = new MeoCordApp(order as any, createMockContainer() as any, mockClient as any, 't')
        await app.start()

        mockClient.emit(
          'interactionCreate',
          invoke('settings', { subcommandGroup: 'notify', subcommand: 'email', enabled: true }),
        )
        await vi.advanceTimersByTimeAsync(0)

        expect(calls).toEqual([{ handler: 'sub', params: { enabled: true } }])
        mockClient = createMockClient()
      }
    })

    it('falls back to the command handler for a subcommand nobody claimed', async () => {
      const { ParentController, SubController, calls } = controllers()
      const app = new MeoCordApp(
        [SubController, ParentController] as any,
        createMockContainer() as any,
        mockClient as any,
        't',
      )
      await app.start()

      mockClient.emit('interactionCreate', invoke('settings', { subcommand: 'theme' }))
      await vi.advanceTimersByTimeAsync(0)

      expect(calls).toEqual([{ handler: 'parent', params: {} }])
    })

    it('hands the handler resolved options rather than raw snowflakes', async () => {
      const target = createMockInteraction(User, { id: '900', username: 'ada' })
      const params: Record<string, unknown>[] = []

      @Controller()
      class KickController {
        @Command('kick', CommandType.SLASH)
        async kick(_i: unknown, received: Record<string, unknown>) {
          params.push(received)
        }
      }

      const app = new MeoCordApp([KickController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit('interactionCreate', invoke('kick', { target, reason: 'spam', silent: false }))
      await vi.advanceTimersByTimeAsync(0)

      // `target` is the resolved User, not the snowflake the gateway also sent.
      expect(params).toEqual([{ target, reason: 'spam', silent: false }])
    })

    it('routes an entry point command to its handler', async () => {
      const calls: string[] = []

      @Controller()
      class EntryController {
        @Command('launch', CommandType.PRIMARY_ENTRY_POINT)
        async launch(..._args: any[]) {
          calls.push('launch')
        }
      }

      const app = new MeoCordApp([EntryController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit(
        'interactionCreate',
        createMockInteraction(PrimaryEntryPointCommandInteraction, { commandName: 'launch' }),
      )
      await vi.advanceTimersByTimeAsync(0)

      expect(calls).toEqual(['launch'])
    })
  })

  // Autocomplete has a three-second window and no reply. Before it was handled the
  // client sat on a loading state until the window closed, with nothing in the log.
  describe('autocomplete dispatch', () => {
    const typing = (commandName: string, options: Parameters<typeof createChatInputOptions>[0]) => {
      const interaction = createMockInteraction(AutocompleteInteraction, { commandName })
      interaction.options = createChatInputOptions(options) as never
      return interaction
    }

    it('routes to the handler declared for the focused option', async () => {
      const calls: { handler: string; params: Record<string, unknown> }[] = []

      @Controller()
      class SearchController {
        @Autocomplete('search', 'query')
        async completeQuery(_i: unknown, params: Record<string, unknown>) {
          calls.push({ handler: 'query', params })
        }

        @Autocomplete('search', 'other')
        async completeOther(..._args: any[]) {
          calls.push({ handler: 'other', params: {} })
        }
      }

      const app = new MeoCordApp([SearchController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit('interactionCreate', typing('search', { focused: 'query', query: 'ad', scope: 'all' }))
      await vi.advanceTimersByTimeAsync(0)

      expect(calls).toEqual([{ handler: 'query', params: { query: 'ad', scope: 'all' } }])
    })

    it('falls back to a command-wide handler for an option nobody named', async () => {
      const calls: string[] = []

      @Controller()
      class SearchController {
        @Autocomplete('search')
        async completeAnything(..._args: any[]) {
          calls.push('anything')
        }
      }

      const app = new MeoCordApp([SearchController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit('interactionCreate', typing('search', { focused: 'whatever', whatever: 'x' }))
      await vi.advanceTimersByTimeAsync(0)

      expect(calls).toEqual(['anything'])
    })

    it('routes a subcommand path', async () => {
      const calls: string[] = []

      @Controller()
      class SettingsController {
        @Autocomplete('settings notify email', 'address')
        async completeAddress(..._args: any[]) {
          calls.push('address')
        }
      }

      const app = new MeoCordApp([SettingsController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit(
        'interactionCreate',
        typing('settings', { subcommandGroup: 'notify', subcommand: 'email', focused: 'address', address: 'a@b.c' }),
      )
      await vi.advanceTimersByTimeAsync(0)

      expect(calls).toEqual(['address'])
    })

    // Not repliable, so the "Command not found!" path cannot run for it -- and leaving
    // the window open is what the user sees as a stuck loading state.
    it('closes the window and says which option is unhandled when nothing matches', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 't')
      await app.start()

      const interaction = typing('search', { focused: 'query', query: 'ad' })
      mockClient.emit('interactionCreate', interaction)
      await vi.advanceTimersByTimeAsync(0)

      expect(interaction.respond).toHaveBeenCalledWith([])
      const warn = vi.mocked(Logger).mock.results[0]?.value.warn
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('autocomplete for "search" option "query"'))
    })

    // The unmatched path ends in an ephemeral "Command not found!" reply, which an
    // autocomplete interaction cannot receive at all.
    it('does not fall through to the command-not-found reply', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit('interactionCreate', typing('search', { focused: 'query', query: 'ad' }))
      await vi.advanceTimersByTimeAsync(0)

      expect(EmbedUtil.createErrorEmbed).not.toHaveBeenCalled()
    })

    // `getFocused` throws when nothing is focused. Routing must still reach a
    // command-wide handler rather than letting that escape the listener.
    it('routes to a command-wide handler when no option is focused', async () => {
      const calls: string[] = []

      @Controller()
      class SearchController {
        @Autocomplete('search')
        async completeAnything(_interaction: AutocompleteInteraction) {
          calls.push('anything')
        }
      }

      const app = new MeoCordApp([SearchController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      mockClient.emit('interactionCreate', typing('search', { query: 'ad' }))
      await vi.advanceTimersByTimeAsync(0)

      expect(calls).toEqual(['anything'])
    })

    it('closes the window when the handler throws', async () => {
      @Controller()
      class BrokenController {
        @Autocomplete('search', 'query')
        async completeQuery(_interaction: AutocompleteInteraction): Promise<void> {
          throw new Error('lookup failed')
        }
      }

      const app = new MeoCordApp([BrokenController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      const interaction = typing('search', { focused: 'query', query: 'ad' })
      mockClient.emit('interactionCreate', interaction)
      await vi.advanceTimersByTimeAsync(0)

      expect(interaction.respond).toHaveBeenCalledWith([])
      const error = vi.mocked(Logger).mock.results[0]?.value.error
      expect(error).toHaveBeenCalledWith(expect.stringContaining('autocomplete for "search"'), expect.any(Error))
    })
  })

  // A command whose subcommands live in separate methods declares the same name more
  // than once. Sending its builder twice makes Discord reject the whole payload.
  describe('registerCommands()', () => {
    const builderFor = (name: string) => ({ toJSON: () => ({ name, type: 1, options: [] }) })

    it('registers one command per name when a builder is declared twice', async () => {
      const set = vi.fn<(commands: unknown[]) => Promise<unknown[]>>().mockResolvedValue([])
      mockClient.application = { commands: { set } } as any

      const builder = builderFor('settings')
      class SettingsBuilder {
        build = () => builder as any
      }
      Reflect.defineMetadata('commandType', CommandType.SLASH, SettingsBuilder)

      @Controller()
      class SettingsController {
        @Command('settings', SettingsBuilder as any)
        async one(..._args: any[]) {}

        @Command('settings', SettingsBuilder as any)
        async two(..._args: any[]) {}
      }

      const app = new MeoCordApp([SettingsController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.registerCommands()

      expect(set).toHaveBeenCalledTimes(1)
      expect(set.mock.calls[0][0]).toHaveLength(1)
    })

    // A builder missing a required field throws from toJSON. Deduplication reads the
    // built payload for the name, so it must not be what turns that into a crash.
    it('does not crash when a builder cannot be serialised', async () => {
      const set = vi.fn<(commands: unknown[]) => Promise<unknown[]>>().mockResolvedValue([])
      mockClient.application = { commands: { set } } as any

      class BrokenBuilder {
        build = () =>
          ({
            toJSON: () => {
              throw new Error('description is required')
            },
          }) as any
      }
      Reflect.defineMetadata('commandType', CommandType.SLASH, BrokenBuilder)

      @Controller()
      class BrokenController {
        @Command('broken', BrokenBuilder as any)
        async handle(..._args: any[]) {}
      }

      const app = new MeoCordApp([BrokenController] as any, createMockContainer() as any, mockClient as any, 't')

      await expect(app.registerCommands()).resolves.toBeUndefined()
      expect(set).toHaveBeenCalledTimes(1)
    })

    it('warns when two different builders claim the same command name', async () => {
      const set = vi.fn<(commands: unknown[]) => Promise<unknown[]>>().mockResolvedValue([])
      mockClient.application = { commands: { set } } as any

      class FirstBuilder {
        build = () => builderFor('settings') as any
      }
      class SecondBuilder {
        build = () => builderFor('settings') as any
      }
      Reflect.defineMetadata('commandType', CommandType.SLASH, FirstBuilder)
      Reflect.defineMetadata('commandType', CommandType.SLASH, SecondBuilder)

      @Controller()
      class SettingsController {
        @Command('settings', FirstBuilder as any)
        async one(..._args: any[]) {}

        @Command('settings', SecondBuilder as any)
        async two(..._args: any[]) {}
      }

      const app = new MeoCordApp([SettingsController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.registerCommands()

      const warn = vi.mocked(Logger).mock.results[0]?.value.warn
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('is built more than once'))
      expect(set.mock.calls[0][0]).toHaveLength(1)
    })
  })

  // Replying twice throws, and it would throw from inside the catch block -- past
  // anything left to handle it, and out of the interactionCreate listener.
  describe('handler failures', () => {
    const failing = (body: (interaction: any) => Promise<void>) => {
      @Controller()
      class FailingController {
        @Command('boom/{id}', CommandType.BUTTON)
        async handle(interaction: any) {
          await body(interaction)
        }
      }
      return FailingController
    }

    it('reports an error the handler threw before replying', async () => {
      const FailingController = failing(async () => {
        throw new Error('handler blew up')
      })
      const app = new MeoCordApp([FailingController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      const interaction = createMockInteraction(ButtonInteraction, { customId: 'boom/1' })
      mockClient.emit('interactionCreate', interaction)
      await vi.advanceTimersByTimeAsync(0)

      expect(EmbedUtil.createErrorEmbed).toHaveBeenCalledWith('An error occurred while executing the command.')
      expect(interaction.reply).toHaveBeenCalled()
    })

    it('does not reply again when the handler already replied and then threw', async () => {
      const FailingController = failing(async interaction => {
        await interaction.reply('partial')
        throw new Error('handler blew up after replying')
      })
      const app = new MeoCordApp([FailingController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      const interaction = createMockInteraction(ButtonInteraction, { customId: 'boom/1' })
      mockClient.emit('interactionCreate', interaction)
      await vi.advanceTimersByTimeAsync(0)

      expect(interaction.reply).toHaveBeenCalledTimes(1)
      const error = vi.mocked(Logger).mock.results[0]?.value.error
      expect(error).toHaveBeenCalledWith(expect.stringContaining('boom/1'), expect.any(Error))
    })

    it('survives an interaction that rejects the error reply', async () => {
      const FailingController = failing(async () => {
        throw new Error('handler blew up')
      })
      const app = new MeoCordApp([FailingController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      const interaction = createMockInteraction(ButtonInteraction, { customId: 'boom/1' })
      interaction.reply.mockRejectedValue(new Error('Unknown interaction'))

      const listener = mockClient.listenersFor('interactionCreate')[0]
      await expect(listener(interaction)).resolves.toBeUndefined()
    })
  })

  // discord.js calls listeners without awaiting them, so anything that rejects out of
  // one is an unhandled rejection -- which terminates the process by default. None of
  // these failures should be able to take the bot down.
  describe('listener resilience', () => {
    const throwingContainer = () => ({
      get: vi.fn(() => {
        throw new Error('No matching bindings found for serviceIdentifier')
      }),
      isBound: vi.fn().mockReturnValue(false),
    })

    @Controller()
    class UnresolvableController {
      @Command('boom/{id}', CommandType.BUTTON)
      async handle(..._args: any[]) {}

      @Autocomplete('search', 'query')
      async complete(_interaction: AutocompleteInteraction) {}

      @ReactionHandler()
      async react(..._args: any[]) {}
    }

    const startWithBrokenContainer = async () => {
      const app = new MeoCordApp([UnresolvableController] as any, throwingContainer() as any, mockClient as any, 't')
      await app.start()
      return app
    }

    // A controller that cannot be constructed is a misconfiguration, and it surfaces on
    // the first interaction -- loudly, but without losing every other user's session.
    it('survives a controller the container cannot resolve, and says so', async () => {
      await startWithBrokenContainer()

      const interaction = createMockInteraction(ButtonInteraction, { customId: 'boom/1' })
      const listener = mockClient.listenersFor('interactionCreate')[0]

      await expect(listener(interaction)).resolves.toBeUndefined()

      const error = vi.mocked(Logger).mock.results[0]?.value.error
      expect(error).toHaveBeenCalledWith(expect.stringContaining('boom/1'), expect.any(Error))
    })

    it('still tells the user the interaction failed', async () => {
      await startWithBrokenContainer()

      const interaction = createMockInteraction(ButtonInteraction, { customId: 'boom/1' })
      await mockClient.listenersFor('interactionCreate')[0](interaction)

      expect(EmbedUtil.createErrorEmbed).toHaveBeenCalledWith('An error occurred while executing the command.')
      expect(interaction.reply).toHaveBeenCalled()
    })

    // Autocomplete cannot be replied to, so closing its window is the only way the
    // client stops showing a loading state.
    it('closes the autocomplete window when dispatch itself fails', async () => {
      await startWithBrokenContainer()

      const interaction = createMockInteraction(AutocompleteInteraction, { commandName: 'search' })
      interaction.options = createChatInputOptions({ focused: 'query', query: 'ad' }) as never

      await expect(mockClient.listenersFor('interactionCreate')[0](interaction)).resolves.toBeUndefined()
      expect(interaction.respond).toHaveBeenCalledWith([])
    })

    it('survives a failing controller on messageCreate', async () => {
      await startWithBrokenContainer()

      const message = { author: { bot: false }, content: 'hello' }

      await expect(mockClient.listenersFor('messageCreate')[0](message)).resolves.toBeUndefined()

      const error = vi.mocked(Logger).mock.results[0]?.value.error
      expect(error).toHaveBeenCalledWith(expect.stringContaining('messageCreate'), expect.any(Error))
    })

    // A reaction arrives for messages the bot can no longer read -- deleted, or in a
    // channel it lost access to. That is ordinary, not a fault.
    it('skips a reaction whose message cannot be fetched, without running handlers', async () => {
      const calls: string[] = []

      @Controller()
      class ReactController {
        @ReactionHandler()
        async react(_reaction: MessageReaction) {
          calls.push('react')
        }
      }

      const app = new MeoCordApp([ReactController] as any, createMockContainer() as any, mockClient as any, 't')
      await app.start()

      const reaction = {
        emoji: { name: '👍' },
        message: { fetch: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('Unknown Message')) },
      }

      const listener = mockClient.listenersFor('messageReactionAdd')[0]
      await expect(listener(reaction, { id: 'user-1' })).resolves.toBeUndefined()

      expect(calls).toEqual([])
      const error = vi.mocked(Logger).mock.results[0]?.value.error
      expect(error).not.toHaveBeenCalled()
    })

    // The activity rotation runs on a timer, where a throw is an uncaught exception no
    // listener wrapper can reach.
    it('survives an activity update that throws', async () => {
      const app = new MeoCordApp([], createMockContainer() as any, mockClient as any, 'token', [{ name: 'Playing' }])
      await app.start()

      mockClient.user.setActivity.mockImplementation(() => {
        throw new Error('shard not ready')
      })
      mockClient.emit('clientReady')

      expect(() => vi.advanceTimersByTime(10000)).not.toThrow()
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
