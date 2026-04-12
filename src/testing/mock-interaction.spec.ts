/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */
import 'reflect-metadata'
import { jest } from '@jest/globals'
import {
  BaseInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Message,
  MessageComponentInteraction,
  MessageReaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js'
import { createMockInteraction, createChatInputOptions } from './mock-interaction.js'
import { MeoCordTestingModule } from './meocord-testing-module.js'
import { Guard, UseGuard } from '@src/decorator/guard.decorator.js'
import { type GuardInterface } from '@src/interface/index.js'

describe('createMockInteraction', () => {
  describe('instanceof checks', () => {
    it('passes instanceof for the given class', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect(interaction).toBeInstanceOf(ButtonInteraction)
    })

    it('passes instanceof for all ancestor classes', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect(interaction).toBeInstanceOf(MessageComponentInteraction)
      expect(interaction).toBeInstanceOf(BaseInteraction)
    })

    it('works for ChatInputCommandInteraction', () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      expect(interaction).toBeInstanceOf(ChatInputCommandInteraction)
      expect(interaction).toBeInstanceOf(BaseInteraction)
    })

    it('works for ModalSubmitInteraction', () => {
      const interaction = createMockInteraction(ModalSubmitInteraction)
      expect(interaction).toBeInstanceOf(ModalSubmitInteraction)
      expect(interaction).toBeInstanceOf(BaseInteraction)
    })

    it('works for StringSelectMenuInteraction', () => {
      const interaction = createMockInteraction(StringSelectMenuInteraction)
      expect(interaction).toBeInstanceOf(StringSelectMenuInteraction)
      expect(interaction).toBeInstanceOf(BaseInteraction)
    })

    it('works for Message', () => {
      const msg = createMockInteraction(Message)
      expect(msg).toBeInstanceOf(Message)
    })

    it('works for MessageReaction', () => {
      const reaction = createMockInteraction(MessageReaction)
      expect(reaction).toBeInstanceOf(MessageReaction)
    })
  })

  describe('auto-stubbing', () => {
    it('auto-stubs prototype methods as jest.fn()', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect(typeof interaction.isButton).toBe('function')
      expect(jest.isMockFunction(interaction.isButton)).toBe(true)
    })

    it('returns the same stub reference on repeated access', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect(interaction.isButton).toBe(interaction.isButton)
    })

    it('stub is callable and configurable', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      interaction.isButton.mockReturnValue(true)
      expect(interaction.isButton()).toBe(true)
    })

    it('auto-stubs nested method access', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      expect(jest.isMockFunction(interaction.reply)).toBe(true)
      interaction.reply.mockResolvedValue(undefined as any)
      await expect(interaction.reply({ content: 'hi' })).resolves.toBeUndefined()
    })

    it('does not stub symbols', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect(jest.isMockFunction((interaction as any)[Symbol.iterator])).toBe(false)
    })

    it('does not make the mock thenable (avoids Promise confusion)', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect((interaction as any).then).toBeUndefined()
    })
  })

  describe('direct property writes', () => {
    it('allows writing primitive properties', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      ;(interaction as any).guildId = 'guild-123'
      expect((interaction as any).guildId).toBe('guild-123')
    })

    it('own property takes precedence over auto-stub', () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      const customOptions = { getSubcommand: jest.fn().mockReturnValue('ping') }
      ;(interaction as any).options = customOptions
      expect((interaction as any).options.getSubcommand()).toBe('ping')
    })
  })
})

describe('createChatInputOptions', () => {
  describe('subcommand routing', () => {
    it('returns subcommand group', () => {
      const options = createChatInputOptions({ subcommandGroup: 'daily', subcommand: 'notes' })
      expect(options.getSubcommandGroup()).toBe('daily')
    })

    it('returns subcommand', () => {
      const options = createChatInputOptions({ subcommandGroup: 'daily', subcommand: 'notes' })
      expect(options.getSubcommand()).toBe('notes')
    })

    it('returns null for missing subcommandGroup when required=false', () => {
      const options = createChatInputOptions({ subcommand: 'notes' })
      expect(options.getSubcommandGroup(false)).toBeNull()
    })

    it('returns null for missing subcommandGroup when not passed', () => {
      const options = createChatInputOptions({ subcommand: 'notes' })
      expect(options.getSubcommandGroup()).toBeNull()
    })

    it('throws for missing subcommandGroup when required=true', () => {
      const options = createChatInputOptions({ subcommand: 'notes' })
      expect(() => options.getSubcommandGroup(true)).toThrow()
    })

    it('throws for missing subcommand when required=true', () => {
      const options = createChatInputOptions({})
      expect(() => options.getSubcommand(true)).toThrow()
    })

    it('does not throw for present subcommand when required=true', () => {
      const options = createChatInputOptions({ subcommand: 'notes' })
      expect(() => options.getSubcommand(true)).not.toThrow()
      expect(options.getSubcommand(true)).toBe('notes')
    })
  })

  describe('value type routing', () => {
    it('getString returns string values', () => {
      const options = createChatInputOptions({ name: 'hutao' })
      expect(options.getString('name')).toBe('hutao')
    })

    it('getNumber returns number values', () => {
      const options = createChatInputOptions({ uid: 12345678 })
      expect(options.getNumber('uid')).toBe(12345678)
    })

    it('getInteger also returns number values', () => {
      const options = createChatInputOptions({ uid: 12345678 })
      expect(options.getInteger('uid')).toBe(12345678)
    })

    it('getBoolean returns boolean values', () => {
      const options = createChatInputOptions({ enabled: true })
      expect(options.getBoolean('enabled')).toBe(true)
    })

    it('getUser returns { id } values', () => {
      const options = createChatInputOptions({ target: { id: 'user-123' } })
      expect(options.getUser('target')).toEqual({ id: 'user-123' })
    })

    it('getRole returns { id } values', () => {
      const options = createChatInputOptions({ role: { id: 'role-abc' } })
      expect(options.getRole('role')).toEqual({ id: 'role-abc' })
    })

    it('getChannel returns { id } values', () => {
      const options = createChatInputOptions({ channel: { id: 'ch-xyz' } })
      expect(options.getChannel('channel')).toEqual({ id: 'ch-xyz' })
    })

    it('getMember returns { id } values', () => {
      const options = createChatInputOptions({ member: { id: 'member-1' } })
      expect(options.getMember('member')).toEqual({ id: 'member-1' })
    })

    it('getMentionable returns { id } values', () => {
      const options = createChatInputOptions({ mention: { id: 'men-1' } })
      expect(options.getMentionable('mention')).toEqual({ id: 'men-1' })
    })
  })

  describe('wrong type returns null', () => {
    it('getNumber returns null for a string value', () => {
      const options = createChatInputOptions({ name: 'hutao' })
      expect(options.getNumber('name')).toBeNull()
    })

    it('getString returns null for a number value', () => {
      const options = createChatInputOptions({ uid: 12345678 })
      expect(options.getString('uid')).toBeNull()
    })

    it('getBoolean returns null for a string value', () => {
      const options = createChatInputOptions({ name: 'hutao' })
      expect(options.getBoolean('name')).toBeNull()
    })

    it('getUser returns null for a string value', () => {
      const options = createChatInputOptions({ name: 'hutao' })
      expect(options.getUser('name')).toBeNull()
    })
  })

  describe('missing option behaviour', () => {
    it('returns null for absent option', () => {
      const options = createChatInputOptions({})
      expect(options.getString('missing')).toBeNull()
    })

    it('throws for absent option when required=true', () => {
      const options = createChatInputOptions({})
      expect(() => options.getString('missing', true)).toThrow()
    })

    it('returns null for absent option when required=false', () => {
      const options = createChatInputOptions({})
      expect(options.getString('missing', false)).toBeNull()
    })
  })

  describe('methods are jest.fn() — configurable per test', () => {
    it('getNumber is a jest mock function', () => {
      const options = createChatInputOptions({ uid: 12345678 })
      expect(jest.isMockFunction(options.getNumber)).toBe(true)
    })

    it('can override getNumber return value per test', () => {
      const options = createChatInputOptions({ uid: 12345678 })
      options.getNumber.mockReturnValue(999)
      expect(options.getNumber('uid')).toBe(999)
    })
  })

  describe('unlisted methods fall through to auto-stub', () => {
    it('getAttachment is auto-stubbed as jest.fn()', () => {
      const options = createChatInputOptions({})
      expect(jest.isMockFunction((options as any).getAttachment)).toBe(true)
    })
  })
})

describe('overrideGuard()', () => {
  // Minimal controller setup helper
  function makeController(guardClass: new (...args: any[]) => GuardInterface) {
    class TestController {
      executed = false

      @UseGuard(guardClass)
      async handle(_ctx: any) {
        this.executed = true
      }
    }
    return TestController
  }

  it('guard stub with canActivate: () => false blocks method execution', async () => {
    @Guard()
    class BlockingGuard implements GuardInterface {
      canActivate() {
        return false
      }
    }

    const TestController = makeController(BlockingGuard)

    const module = MeoCordTestingModule.create({ controllers: [TestController] })
      .overrideGuard(BlockingGuard)
      .useValue({ canActivate: () => false })
      .compile()

    const ctrl = module.get(TestController)
    await ctrl.handle(createMockInteraction(BaseInteraction))
    expect(ctrl.executed).toBe(false)
  })

  it('guard stub with canActivate: () => true allows method execution', async () => {
    @Guard()
    class RealGuard implements GuardInterface {
      // Would normally need DI deps — but override replaces it entirely
      canActivate() {
        return false
      } // real impl denies
    }

    const TestController = makeController(RealGuard)

    const module = MeoCordTestingModule.create({ controllers: [TestController] })
      .overrideGuard(RealGuard)
      .useValue({ canActivate: () => true })
      .compile()

    const ctrl = module.get(TestController)
    await ctrl.handle(createMockInteraction(BaseInteraction))
    expect(ctrl.executed).toBe(true)
  })

  it('overriding a guard requires no DI dependencies for that guard', async () => {
    @Guard()
    class GuardWithDeps implements GuardInterface {
      constructor(_someService: unknown) {}
      canActivate() {
        return true
      }
    }

    const TestController = makeController(GuardWithDeps)

    // No providers for GuardWithDeps or its deps — should not throw
    expect(() =>
      MeoCordTestingModule.create({ controllers: [TestController] })
        .overrideGuard(GuardWithDeps)
        .useValue({ canActivate: () => true })
        .compile(),
    ).not.toThrow()
  })

  it('chains multiple overrideGuard calls', async () => {
    const order: string[] = []

    @Guard()
    class GuardA implements GuardInterface {
      canActivate() {
        order.push('A')
        return true
      }
    }

    @Guard()
    class GuardB implements GuardInterface {
      canActivate() {
        order.push('B')
        return true
      }
    }

    class TestController {
      executed = false

      @UseGuard(GuardA, GuardB)
      async handle(_ctx: any) {
        this.executed = true
      }
    }

    const module = MeoCordTestingModule.create({ controllers: [TestController] })
      .overrideGuard(GuardA)
      .useValue({
        canActivate: () => {
          order.push('stubA')
          return true
        },
      })
      .overrideGuard(GuardB)
      .useValue({
        canActivate: () => {
          order.push('stubB')
          return true
        },
      })
      .compile()

    const ctrl = module.get(TestController)
    await ctrl.handle(createMockInteraction(BaseInteraction))

    expect(order).toEqual(['stubA', 'stubB'])
    expect(ctrl.executed).toBe(true)
  })
})
