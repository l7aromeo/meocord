import { AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction } from 'discord.js'
import { createDiscordError, createMockInteraction, getResponse } from '@src/testing/index.js'

describe('getResponse', () => {
  it('reports an interaction respond() never saw from what discord.js shows on it', async () => {
    const replied = createMockInteraction(ChatInputCommandInteraction)
    await replied.reply('raw')
    const deferred = createMockInteraction(ButtonInteraction)
    await deferred.deferUpdate()

    expect(getResponse(replied)).toEqual({ state: 'replied', sent: true, calls: [] })
    expect(getResponse(deferred)).toEqual({ state: 'deferred', sent: false, calls: [] })
    expect(getResponse(createMockInteraction(ChatInputCommandInteraction))).toEqual({ state: 'unanswered', sent: false, calls: [] })
  })

  it('reports an autocomplete, which has no reply, as unanswered', () => {
    expect(getResponse(createMockInteraction(AutocompleteInteraction))).toEqual({ state: 'unanswered', sent: false, calls: [] })
  })
})

describe('createDiscordError', () => {
  it('builds the error discord.js throws, with the code, and a message naming it by default', () => {
    const error = createDiscordError(50027)

    expect(error.code).toBe(50027)
    expect(error.message).toContain('50027')
    expect(createDiscordError(10062, 'Unknown interaction').message).toBe('Unknown interaction')
  })
})
