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
  Client,
  ContextMenuCommandInteraction,
  Guild,
  Message,
  MessageComponentInteraction,
  MessageFlags,
  MessageReaction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  AutocompleteInteraction,
  TextChannel,
  User,
  UserSelectMenuInteraction,
  RoleSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  UserContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
  PrimaryEntryPointCommandInteraction,
} from 'discord.js'
import {
  createMockInteraction,
  createChatInputOptions,
  createMockUser,
  createMockClient,
  createMockGuild,
  createMockChannel,
  createMockMessage,
} from './mock-interaction.js'
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

  describe('auto-configured type guards', () => {
    it('ChatInputCommandInteraction auto-returns true for isChatInputCommand()', () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      expect(interaction.isChatInputCommand()).toBe(true)
    })

    it('ChatInputCommandInteraction auto-returns true for isCommand()', () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      expect(interaction.isCommand()).toBe(true)
    })

    it('ButtonInteraction auto-returns true for isButton()', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect(interaction.isButton()).toBe(true)
    })

    it('ButtonInteraction auto-returns true for isMessageComponent()', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect(interaction.isMessageComponent()).toBe(true)
    })

    it('StringSelectMenuInteraction auto-returns true for isStringSelectMenu()', () => {
      const interaction = createMockInteraction(StringSelectMenuInteraction)
      expect(interaction.isStringSelectMenu()).toBe(true)
    })

    it('StringSelectMenuInteraction auto-returns true for isMessageComponent()', () => {
      const interaction = createMockInteraction(StringSelectMenuInteraction)
      expect(interaction.isMessageComponent()).toBe(true)
    })

    it('ModalSubmitInteraction auto-returns true for isModalSubmit()', () => {
      const interaction = createMockInteraction(ModalSubmitInteraction)
      expect(interaction.isModalSubmit()).toBe(true)
    })

    it('ContextMenuCommandInteraction auto-returns true for isContextMenuCommand()', () => {
      const interaction = createMockInteraction(ContextMenuCommandInteraction)
      expect(interaction.isContextMenuCommand()).toBe(true)
    })

    it('AutocompleteInteraction auto-returns true for isAutocomplete()', () => {
      const interaction = createMockInteraction(AutocompleteInteraction)
      expect(interaction.isAutocomplete()).toBe(true)
    })

    it('UserSelectMenuInteraction auto-returns true for isUserSelectMenu()', () => {
      const interaction = createMockInteraction(UserSelectMenuInteraction)
      expect(interaction.isUserSelectMenu()).toBe(true)
    })

    it('UserSelectMenuInteraction auto-returns true for isMessageComponent()', () => {
      const interaction = createMockInteraction(UserSelectMenuInteraction)
      expect(interaction.isMessageComponent()).toBe(true)
    })

    it('RoleSelectMenuInteraction auto-returns true for isRoleSelectMenu()', () => {
      const interaction = createMockInteraction(RoleSelectMenuInteraction)
      expect(interaction.isRoleSelectMenu()).toBe(true)
    })

    it('MentionableSelectMenuInteraction auto-returns true for isMentionableSelectMenu()', () => {
      const interaction = createMockInteraction(MentionableSelectMenuInteraction)
      expect(interaction.isMentionableSelectMenu()).toBe(true)
    })

    it('ChannelSelectMenuInteraction auto-returns true for isChannelSelectMenu()', () => {
      const interaction = createMockInteraction(ChannelSelectMenuInteraction)
      expect(interaction.isChannelSelectMenu()).toBe(true)
    })

    it('UserContextMenuCommandInteraction auto-returns true for isUserContextMenuCommand()', () => {
      const interaction = createMockInteraction(UserContextMenuCommandInteraction)
      expect(interaction.isUserContextMenuCommand()).toBe(true)
    })

    it('MessageContextMenuCommandInteraction auto-returns true for isMessageContextMenuCommand()', () => {
      const interaction = createMockInteraction(MessageContextMenuCommandInteraction)
      expect(interaction.isMessageContextMenuCommand()).toBe(true)
    })

    it('PrimaryEntryPointCommandInteraction auto-returns true for isPrimaryEntryPointCommand()', () => {
      const interaction = createMockInteraction(PrimaryEntryPointCommandInteraction)
      expect(interaction.isPrimaryEntryPointCommand()).toBe(true)
    })

    it('StringSelectMenuInteraction auto-returns true for deprecated isSelectMenu()', () => {
      const interaction = createMockInteraction(StringSelectMenuInteraction)
      expect(interaction.isSelectMenu()).toBe(true)
    })

    it('user can still override type guard return value', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      interaction.isButton.mockReturnValue(false)
      expect(interaction.isButton()).toBe(false)
    })

    it('BaseInteraction type guards return false (no type fields set)', () => {
      const interaction = createMockInteraction(BaseInteraction)
      expect(interaction.isChatInputCommand()).toBe(false)
      expect(interaction.isButton()).toBe(false)
    })
  })

  describe('isRepliable', () => {
    it('returns true for ChatInputCommandInteraction', () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      expect(interaction.isRepliable()).toBe(true)
    })

    it('returns true for ButtonInteraction', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect(interaction.isRepliable()).toBe(true)
    })

    it('returns true for ModalSubmitInteraction', () => {
      const interaction = createMockInteraction(ModalSubmitInteraction)
      expect(interaction.isRepliable()).toBe(true)
    })

    it('returns false for AutocompleteInteraction', () => {
      const interaction = createMockInteraction(AutocompleteInteraction)
      expect(interaction.isRepliable()).toBe(false)
    })

    it('is jest.fn() — can be overridden per test', () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      interaction.isRepliable.mockReturnValue(false)
      expect(interaction.isRepliable()).toBe(false)
    })
  })

  describe('reply state machine', () => {
    it('replied and deferred start as false booleans', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect(interaction.replied).toBe(false)
      expect(interaction.deferred).toBe(false)
      expect(typeof interaction.replied).toBe('boolean')
      expect(typeof interaction.deferred).toBe('boolean')
    })

    it('reply() sets replied to true', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.reply({ content: 'hi' })
      expect(interaction.replied).toBe(true)
    })

    it('deferReply() sets deferred to true', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.deferReply()
      expect(interaction.deferred).toBe(true)
    })

    it('reply() twice throws', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.reply({ content: 'first' })
      await expect(interaction.reply({ content: 'second' })).rejects.toThrow()
    })

    it('deferReply() then reply() throws', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.deferReply()
      await expect(interaction.reply({ content: 'hi' })).rejects.toThrow()
    })

    it('reply() then deferReply() throws', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.reply({ content: 'hi' })
      await expect(interaction.deferReply()).rejects.toThrow()
    })

    it('followUp() before any reply throws', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await expect(interaction.followUp({ content: 'hi' })).rejects.toThrow()
    })

    it('followUp() after reply() resolves', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.reply({ content: 'first' })
      await expect(interaction.followUp({ content: 'second' })).resolves.not.toThrow()
    })

    it('followUp() after deferReply() resolves', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.deferReply()
      await expect(interaction.followUp({ content: 'hi' })).resolves.not.toThrow()
    })

    it('editReply() before any reply throws', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await expect(interaction.editReply({ content: 'hi' })).rejects.toThrow()
    })

    it('deleteReply() before any reply throws', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await expect(interaction.deleteReply()).rejects.toThrow()
    })

    it('reply is jest.fn() — call assertions still work', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      await interaction.reply({ content: 'hello' })
      expect(interaction.reply).toHaveBeenCalledWith({ content: 'hello' })
    })

    it('followUp() resolves to a Message instance', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      await interaction.reply({ content: 'first' })
      const msg = await interaction.followUp({ content: 'second' })
      expect(msg).toBeInstanceOf(Message)
    })

    it('editReply() resolves to a Message instance', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      await interaction.deferReply()
      const msg = await interaction.editReply({ content: 'done' })
      expect(msg).toBeInstanceOf(Message)
    })

    it('state machine is not set up for AutocompleteInteraction (not repliable)', () => {
      const interaction = createMockInteraction(AutocompleteInteraction)
      expect(typeof (interaction as any).replied).not.toBe('boolean')
      expect(typeof (interaction as any).deferred).not.toBe('boolean')
    })

    it('ephemeral starts as false', () => {
      const interaction = createMockInteraction(ButtonInteraction)
      expect((interaction as any).ephemeral).toBe(false)
    })

    it('reply() with ephemeral flag sets ephemeral to true', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.reply({ flags: MessageFlags.Ephemeral })
      expect((interaction as any).ephemeral).toBe(true)
    })

    it('reply() without ephemeral flag leaves ephemeral false', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.reply({ content: 'hi' })
      expect((interaction as any).ephemeral).toBe(false)
    })

    it('deferReply() with ephemeral flag sets ephemeral to true', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      expect((interaction as any).ephemeral).toBe(true)
    })

    it('editReply() after deferReply() sets replied to true', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.deferReply()
      expect(interaction.replied).toBe(false)
      await interaction.editReply({ content: 'done' })
      expect(interaction.replied).toBe(true)
    })

    it('followUp() after reply() sets replied to true (already true, stays true)', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.reply({ content: 'first' })
      await interaction.followUp({ content: 'second' })
      expect(interaction.replied).toBe(true)
    })
  })

  describe('deferUpdate / update (MessageComponentInteraction)', () => {
    it('update() sets replied to true', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await (interaction as any).update({ content: 'updated' })
      expect(interaction.replied).toBe(true)
    })

    it('deferUpdate() sets deferred to true', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await (interaction as any).deferUpdate()
      expect(interaction.deferred).toBe(true)
    })

    it('update() twice throws', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await (interaction as any).update({ content: 'first' })
      await expect((interaction as any).update({ content: 'second' })).rejects.toThrow()
    })

    it('deferUpdate() then reply() throws', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await (interaction as any).deferUpdate()
      await expect(interaction.reply({ content: 'hi' })).rejects.toThrow()
    })

    it('update() is not set up for ChatInputCommandInteraction', () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      expect(jest.isMockFunction((interaction as any).update)).toBe(false)
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
      expect(options.getSubcommand(true)).toBe('notes')
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

describe('createMockMessage', () => {
  it('returns a Message instance', () => {
    expect(createMockMessage()).toBeInstanceOf(Message)
  })

  it('methods are auto-stubbed as jest.fn()', () => {
    const msg = createMockMessage()
    expect(jest.isMockFunction(msg.edit)).toBe(true)
    expect(jest.isMockFunction(msg.react)).toBe(true)
  })

  it('deleted starts as false', () => {
    expect((createMockMessage() as any).deleted).toBe(false)
  })

  it('delete() sets deleted to true', async () => {
    const msg = createMockMessage()
    await msg.delete()
    expect((msg as any).deleted).toBe(true)
  })

  it('delete() twice throws', async () => {
    const msg = createMockMessage()
    await msg.delete()
    await expect(msg.delete()).rejects.toThrow()
  })

  it('edit() after delete() throws', async () => {
    const msg = createMockMessage()
    await msg.delete()
    await expect(msg.edit({ content: 'new' })).rejects.toThrow()
  })

  it('reply() after delete() throws', async () => {
    const msg = createMockMessage()
    await msg.delete()
    await expect(msg.reply({ content: 'hi' })).rejects.toThrow()
  })

  it('react() after delete() throws', async () => {
    const msg = createMockMessage()
    await msg.delete()
    await expect(msg.react('👍')).rejects.toThrow()
  })

  it('edit() resolves to a Message instance', async () => {
    const result = await createMockMessage().edit({ content: 'updated' })
    expect(result).toBeInstanceOf(Message)
  })

  it('reply() resolves to a Message instance', async () => {
    const result = await createMockMessage().reply({ content: 'hi' })
    expect(result).toBeInstanceOf(Message)
  })

  it('delete() is jest.fn() — call assertions still work', async () => {
    const msg = createMockMessage()
    await msg.delete()
    expect(msg.delete).toHaveBeenCalledTimes(1)
  })
})

describe('createMockUser', () => {
  it('returns a User instance', () => {
    expect(createMockUser()).toBeInstanceOf(User)
  })

  it('send() is a jest.fn()', () => {
    const user = createMockUser()
    expect(jest.isMockFunction(user.send)).toBe(true)
  })

  it('send() can be asserted on', async () => {
    const user = createMockUser()
    await user.send({ embeds: [] })
    expect(user.send).toHaveBeenCalledWith({ embeds: [] })
  })

  it('createDM() is a jest.fn()', () => {
    expect(jest.isMockFunction(createMockUser().createDM)).toBe(true)
  })
})

describe('createMockClient', () => {
  it('returns a Client instance', () => {
    expect(createMockClient()).toBeInstanceOf(Client)
  })

  it('client.users and client.guilds are independent nested stubs', () => {
    const client = createMockClient()
    expect(client.users).not.toBe(client.guilds)
  })

  it('client.users.fetch is a jest.fn() by default', () => {
    const client = createMockClient()
    expect(jest.isMockFunction((client.users as any).fetch)).toBe(true)
  })

  it('client.channels.fetch is a jest.fn() by default', () => {
    const client = createMockClient()
    expect(jest.isMockFunction((client.channels as any).fetch)).toBe(true)
  })

  it('client.guilds.fetch is a jest.fn() by default', () => {
    const client = createMockClient()
    expect(jest.isMockFunction((client.guilds as any).fetch)).toBe(true)
  })

  it('client.application.commands.fetch is a jest.fn() by default', () => {
    const client = createMockClient()
    expect(jest.isMockFunction((client.application as any).commands.fetch)).toBe(true)
  })

  it('client.application.commands.set is a jest.fn() by default', () => {
    const client = createMockClient()
    expect(jest.isMockFunction((client.application as any).commands.set)).toBe(true)
  })

  it('client.user.avatarURL is a jest.fn() by default', () => {
    const client = createMockClient()
    expect(jest.isMockFunction((client.user as any).avatarURL)).toBe(true)
  })

  it('client.users.fetch can be overridden to resolve a mock user', async () => {
    const client = createMockClient()
    const user = createMockUser()
    ;(client.users as any).fetch = jest.fn(() => Promise.resolve(user))
    const result = await (client.users as any).fetch('user-123')
    expect(result).toBe(user)
    expect((client.users as any).fetch).toHaveBeenCalledWith('user-123')
  })

  it('client.users.fetch resolves and can be asserted without override', async () => {
    const client = createMockClient()
    await (client.users as any).fetch('user-123')
    expect((client.users as any).fetch).toHaveBeenCalledWith('user-123')
  })
})

describe('createMockGuild', () => {
  it('returns a Guild instance', () => {
    expect(createMockGuild()).toBeInstanceOf(Guild)
  })

  it('guild.members.fetch is a jest.fn() by default', () => {
    expect(jest.isMockFunction((createMockGuild().members as any).fetch)).toBe(true)
  })

  it('guild.channels.fetch is a jest.fn() by default', () => {
    expect(jest.isMockFunction((createMockGuild().channels as any).fetch)).toBe(true)
  })

  it('guild.roles.fetch is a jest.fn() by default', () => {
    expect(jest.isMockFunction((createMockGuild().roles as any).fetch)).toBe(true)
  })

  it('guild.bans.fetch is a jest.fn() by default', () => {
    expect(jest.isMockFunction((createMockGuild().bans as any).fetch)).toBe(true)
  })

  it('guild.members.fetch and guild.channels.fetch are independent stubs', () => {
    const guild = createMockGuild()
    expect((guild.members as any).fetch).not.toBe((guild.channels as any).fetch)
  })
})

describe('createMockChannel', () => {
  it('returns a TextChannel instance', () => {
    expect(createMockChannel(TextChannel)).toBeInstanceOf(TextChannel)
  })

  it('send() is a jest.fn()', () => {
    const channel = createMockChannel(TextChannel)
    expect(jest.isMockFunction(channel.send)).toBe(true)
  })

  it('send() can be asserted on', async () => {
    const channel = createMockChannel(TextChannel)
    await channel.send({ content: 'hi' })
    expect(channel.send).toHaveBeenCalledWith({ content: 'hi' })
  })
})
