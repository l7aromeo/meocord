import {
  type APIAuthorizingIntegrationOwnersMap,
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
} from 'discord.js'
import { getInstallContext } from '@src/common/response/install-context.js'
import { createMockInteraction } from '@src/testing/index.js'

const { GuildInstall, UserInstall } = ApplicationIntegrationType

function interactionIn(
  context: InteractionContextType | null,
  owners: APIAuthorizingIntegrationOwnersMap,
  guildId?: string,
) {
  return createMockInteraction(ChatInputCommandInteraction, { context, authorizingIntegrationOwners: owners, guildId })
}

describe('getInstallContext', () => {
  it.each([
    ['a server the bot was added to', InteractionContextType.Guild, { [GuildInstall]: 'guild' }, { where: 'guild', botInstalled: true }],
    [
      'a server the bot is also user-installed in',
      InteractionContextType.Guild,
      { [GuildInstall]: 'guild', [UserInstall]: 'user' },
      { where: 'guild', botInstalled: true },
    ],
    ['a server the bot is not in', InteractionContextType.Guild, { [UserInstall]: 'user' }, { where: 'guild', botInstalled: false }],
    // Interactions came only through the bot before user installs, and report no owners
    ['a server with no owners reported', InteractionContextType.Guild, {}, { where: 'guild', botInstalled: true }],
    ['a direct message with the bot', InteractionContextType.BotDM, { [UserInstall]: 'user' }, { where: 'bot-dm', botInstalled: true }],
    [
      'a direct or group message between users',
      InteractionContextType.PrivateChannel,
      { [UserInstall]: 'user' },
      { where: 'private-channel', botInstalled: false },
    ],
  ] as const)('reports %s', (_label, context, owners, expected) => {
    expect(getInstallContext(interactionIn(context, owners))).toEqual(expected)
  })

  it('treats an interaction without a context as reaching the bot, in a server or a DM', () => {
    expect(getInstallContext(interactionIn(null, {}, 'guild'))).toEqual({ where: 'guild', botInstalled: true })
    expect(getInstallContext(interactionIn(null, {}))).toEqual({ where: 'bot-dm', botInstalled: true })
  })
})
