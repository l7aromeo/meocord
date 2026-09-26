import { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction, TextChannel } from 'discord.js'
import { Command, Controller, Cooldown } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { createMockChannel, createMockGuild, createMockInteraction, createMockMessage, createMockUser, MeoCordTestingModule } from '@src/testing/index.js'

const SNOWFLAKE = /^\d{17,20}$/

describe('mock ids', () => {
  it('gives an interaction, its user and its channel snowflake ids, distinct per mock and stable per read', () => {
    const [a, b] = [createMockInteraction(ButtonInteraction), createMockInteraction(ButtonInteraction)]

    for (const id of [a.id, a.user.id, a.channelId, b.id, b.user.id]) expect(id).toMatch(SNOWFLAKE)
    expect(new Set([a.id, b.id, a.user.id, b.user.id, a.channelId]).size).toBe(5)
    expect(a.user.id).toBe(a.user.id)
    expect(a.user.bot).toBe(false)
  })

  it('gives users, guilds, channels and messages snowflake ids, the message consistent with its guild and channel', () => {
    const [user, other] = [createMockUser(), createMockUser()]
    expect(user.id).toMatch(SNOWFLAKE)
    expect(user.id).not.toBe(other.id)
    expect(createMockGuild().id).toMatch(SNOWFLAKE)
    expect(createMockChannel(TextChannel).id).toMatch(SNOWFLAKE)

    const message = createMockMessage()
    for (const id of [message.id, message.author.id, message.channelId, message.guildId]) expect(id).toMatch(SNOWFLAKE)
    expect(message.channelId).toBe(message.channel.id)
    expect(message.guildId).toBe(message.guild?.id)
  })

  it('keeps ids a test gives', () => {
    const interaction = createMockInteraction(ChatInputCommandInteraction, { id: '1', channelId: '2', user: { id: '3' } as never })
    expect([interaction.id, interaction.channelId, interaction.user.id]).toEqual(['1', '2', '3'])
    expect(createMockMessage({ id: '4' }).id).toBe('4')
  })

  it('counts two default users apart in a per-user cooldown', async () => {
    @Controller()
    class Daily {
      @Command('daily', CommandType.SLASH)
      @Cooldown({ seconds: 60 })
      async daily(_interaction: ChatInputCommandInteraction) {}
    }
    const module = MeoCordTestingModule.create({ controllers: [Daily] }).compile()
    const call = () => createMockInteraction(ChatInputCommandInteraction, { commandName: 'daily' })

    await module.invoke(Daily, 'daily', call())
    await expect(module.invoke(Daily, 'daily', call())).resolves.toEqual({ ran: true })
  })
})

describe('a mock made without a server', () => {
  it('has no guildId, guild or member, as a direct message does', () => {
    const interaction = createMockInteraction(ChatInputCommandInteraction)
    expect(interaction.guildId).toBeNull()
    expect(interaction.guild).toBeNull()
    expect(interaction.member).toBeNull()
    expect(interaction.inGuild()).toBe(false)
  })

  it('is in a server once given a guildId, with a member', () => {
    const interaction = createMockInteraction(ChatInputCommandInteraction, { guildId: '100000000000000001' })
    expect(interaction.guildId).toBe('100000000000000001')
    expect(interaction.member).toBeTruthy()
    expect(interaction.inGuild()).toBe(true)
  })
})

describe('the autocomplete mock', () => {
  it('refuses more than 25 choices, as Discord does', async () => {
    const choices = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `c${i}`, value: `c${i}` }))
    await expect(createMockInteraction(AutocompleteInteraction).respond(choices(26))).rejects.toThrow(/25/)
    await expect(createMockInteraction(AutocompleteInteraction).respond(choices(25))).resolves.toBeUndefined()
  })
})
