import { ApplicationIntegrationType, type BaseInteraction, InteractionContextType } from 'discord.js'

/**
 * Where an interaction happened, as {@link getInstallContext} reports it.
 */
export interface InstallContext {
  /**
   * `'guild'` for a server; `'bot-dm'` for a direct message with the bot; `'private-channel'` for a
   * direct or group message between users, reachable only by a user-installed app.
   */
  where: 'guild' | 'bot-dm' | 'private-channel'

  /**
   * Whether the bot itself is present where the interaction happened: a server that installed the
   * app, or a direct message with the bot. Only then can it use the channel API; it says nothing about
   * the bot's permissions in the channel.
   */
  botInstalled: boolean
}

/**
 * Reports where an interaction happened and whether the bot is present there, from Discord's
 * `context` and the integrations that authorized the interaction.
 *
 * A user-installed app can be used in servers the bot is not in, and in direct messages between
 * users; there, only the interaction's own methods (`reply`, `editReply`, `followUp`) reach the user.
 *
 * @param interaction - The interaction to inspect.
 * @returns Where it happened, and whether the bot is present there.
 *
 * @example
 * ```typescript
 * const { where, botInstalled } = getInstallContext(interaction)
 * if (where === 'guild' && !botInstalled) {
 *   // A user-installed command in a server without the bot: answer through the interaction only
 * }
 * ```
 */
export function getInstallContext(interaction: BaseInteraction): InstallContext {
  const owners = interaction.authorizingIntegrationOwners ?? {}
  const guildInstalled = owners[ApplicationIntegrationType.GuildInstall] !== undefined
  const userInstalled = owners[ApplicationIntegrationType.UserInstall] !== undefined

  switch (interaction.context) {
    case InteractionContextType.BotDM:
      return { where: 'bot-dm', botInstalled: true }
    case InteractionContextType.PrivateChannel:
      return { where: 'private-channel', botInstalled: false }
    case InteractionContextType.Guild:
      // With no owners reported, the interaction came through the bot, as every interaction did before user installs.
      return { where: 'guild', botInstalled: guildInstalled || !userInstalled }
    default:
      // Discord omits the context for interactions it created before contexts existed, which reached only the bot.
      return interaction.guildId ? { where: 'guild', botInstalled: true } : { where: 'bot-dm', botInstalled: true }
  }
}
