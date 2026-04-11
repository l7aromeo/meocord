/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { EmbedBuilder } from 'discord.js'
import { Theme } from '@src/common/index.js'

export const createErrorEmbed = (description: string) => {
  const embed = new EmbedBuilder()
  embed.setColor(Theme.errorColor)
  embed.setTitle('Oops!')
  embed.setDescription(description)
  return embed
}
