/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { EmbedBuilder } from 'discord.js'
import { createErrorEmbed } from '@src/util/embed.util.js'
import { Theme } from '@src/common/theme.js'

describe('createErrorEmbed', () => {
  it('returns an EmbedBuilder instance', () => {
    const embed = createErrorEmbed('something failed')
    expect(embed).toBeInstanceOf(EmbedBuilder)
  })

  it('sets the title to "Oops!"', () => {
    const embed = createErrorEmbed('test error')
    expect(embed.data.title).toBe('Oops!')
  })

  it('sets the provided description', () => {
    const description = 'Custom error description'
    const embed = createErrorEmbed(description)
    expect(embed.data.description).toBe(description)
  })

  it('uses the error color from Theme', () => {
    const embed = createErrorEmbed('test')
    // Discord.js stores color as a decimal number
    const expectedColor = parseInt((Theme.errorColor as string).replace('#', ''), 16)
    expect(embed.data.color).toBe(expectedColor)
  })
})
