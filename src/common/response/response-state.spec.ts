import {
  type APIEmbed,
  ApplicationIntegrationType,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ComponentType,
  InteractionContextType,
  type Message,
  MessageFlags,
  MessageFlagsBitField,
  ModalBuilder,
  ModalSubmitInteraction,
  resolveColor,
  StringSelectMenuInteraction,
} from 'discord.js'
import { vi } from 'vitest'
import { Logger } from '@src/common/logger.js'
import { Theme } from '@src/common/theme.js'
import { GuardDeniedError } from '@src/common/errors.js'
import { respond } from '@src/common/response/response-state.js'
import { RENDERED_CONTAINER_ID, setPresenter } from '@src/common/response/presenter.js'
import { UnroutedExecutionContext } from '@src/common/execution-context.js'
import { createDiscordError, createMockInteraction, createMockMessage, getResponse } from '@src/testing/index.js'

const { Ephemeral, SuppressEmbeds, SuppressNotifications, IsComponentsV2 } = MessageFlags

interface Payload { flags?: number; embeds?: APIEmbed[]; components?: { type: number; id?: number }[]; content?: string }

function sent(method: { mock: { calls: unknown[][] } }, call = 0): Payload {
  return method.mock.calls[call][0] as Payload
}

function messageWith(options: { flags?: number; embeds?: APIEmbed[]; components?: unknown[] } = {}): Message {
  const message = createMockMessage()
  Object.assign(message, {
    flags: new MessageFlagsBitField(options.flags ?? 0),
    embeds: (options.embeds ?? []).map(embed => ({ toJSON: () => embed })),
    components: (options.components ?? []).map(component => ({ toJSON: () => component })),
  })
  return message as unknown as Message
}

const command = () => createMockInteraction(ChatInputCommandInteraction)
const button = (message = messageWith()) => createMockInteraction(ButtonInteraction, { customId: 'refresh', message })

describe('respond()', () => {
  it('returns one state per interaction', () => {
    const interaction = command()
    expect(respond(interaction)).toBe(respond(interaction))
  })

  it('refuses an autocomplete interaction, which answers with respond([])', () => {
    const autocomplete = { isRepliable: () => false } as never
    expect(() => respond(autocomplete)).toThrow('autocomplete answers with respond([])')
  })

  describe('send()', () => {
    it('replies to an unanswered command, then edits on a second send', async () => {
      const interaction = command()

      await respond(interaction).send('first')
      await respond(interaction).send('second')

      expect(sent(interaction.reply)).toMatchObject({ content: 'first', withResponse: true })
      expect(sent(interaction.editReply)).toMatchObject({ content: 'second' })
      expect(respond(interaction).state).toBe('replied')
    })

    it("updates an unanswered component's message instead of replying", async () => {
      const interaction = button()

      await respond(interaction).send({ content: 'updated' })

      expect(sent(interaction.update)).toMatchObject({ content: 'updated' })
      expect(interaction.reply).not.toHaveBeenCalled()
    })

    it('edits once the interaction is deferred', async () => {
      const interaction = command()
      await respond(interaction).acknowledge()

      await respond(interaction).send('done')

      expect(sent(interaction.editReply)).toMatchObject({ content: 'done' })
    })

    it('picks up answers made directly with discord.js', async () => {
      const interaction = command()
      await interaction.reply('raw reply')

      await respond(interaction).send('through respond')

      expect(interaction.reply).toHaveBeenCalledTimes(1)
      expect(sent(interaction.editReply)).toMatchObject({ content: 'through respond' })
    })
  })

  describe('flags', () => {
    it('keeps one call’s flags out of the next call', async () => {
      const interaction = command()

      await respond(interaction).send({ content: 'private', flags: Ephemeral | SuppressNotifications })
      await respond(interaction).followUp({ content: 'public' })

      expect(sent(interaction.reply).flags).toBe(Ephemeral | SuppressNotifications)
      expect(sent(interaction.followUp).flags).toBe(0)
    })

    it('defers a reply with Ephemeral only', async () => {
      const interaction = command()

      await respond(interaction).acknowledge({ ephemeral: true })

      expect(sent(interaction.deferReply).flags).toBe(Ephemeral)
    })

    it('drops flags an edit cannot take, with a development warning', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      const interaction = command()
      await respond(interaction).acknowledge()

      await respond(interaction).send({ content: 'x', flags: Ephemeral | SuppressEmbeds })

      expect(sent(interaction.editReply).flags).toBe(SuppressEmbeds)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ephemeral'))
      warn.mockRestore()
    })

    it('keeps IsComponentsV2 on edits of a Components V2 message, dropping content and embeds', async () => {
      const interaction = button(messageWith({ flags: IsComponentsV2 }))
      await respond(interaction).acknowledge()

      await respond(interaction).send({ content: 'ignored', embeds: [{ description: 'ignored' }], components: [] })

      const payload = sent(interaction.editReply)
      expect(payload.flags).toBe(IsComponentsV2)
      expect(payload).not.toHaveProperty('content')
      expect(payload).not.toHaveProperty('embeds')
    })
  })

  describe('followUp()', () => {
    it('is the first reply before any answer', async () => {
      const interaction = button()

      await respond(interaction).followUp({ content: 'hi', flags: Ephemeral })

      expect(sent(interaction.reply).flags).toBe(Ephemeral)
      expect(interaction.update).not.toHaveBeenCalled()
    })

    it("becomes the deferred reply of a command while nothing is sent, as Discord makes it", async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
      const interaction = command()
      await respond(interaction).acknowledge()

      await respond(interaction).followUp({ content: 'hi', flags: Ephemeral })

      expect(interaction.followUp).not.toHaveBeenCalled()
      expect(sent(interaction.editReply)).toMatchObject({ content: 'hi' })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ephemeral flag has no effect'))
      warn.mockRestore()
    })

    it('follows up after a deferred component update, keeping Ephemeral', async () => {
      const interaction = button()
      await respond(interaction).acknowledge()

      await respond(interaction).followUp({ content: 'private note', flags: Ephemeral })

      expect(sent(interaction.followUp)).toMatchObject({ content: 'private note', flags: Ephemeral })
    })
  })

  describe('acknowledge()', () => {
    it('defers a component invisibly, with an update', async () => {
      const interaction = button()

      await respond(interaction).acknowledge()

      expect(interaction.deferUpdate).toHaveBeenCalledTimes(1)
      expect(interaction.deferReply).not.toHaveBeenCalled()
    })

    it('treats a modal submitted from a message as a component', async () => {
      const interaction = createMockInteraction(ModalSubmitInteraction, { message: messageWith() })

      await respond(interaction).acknowledge()

      expect(interaction.deferUpdate).toHaveBeenCalledTimes(1)
    })

    it('shares one acknowledgement between concurrent calls', async () => {
      const interaction = command()

      await Promise.all([respond(interaction).acknowledge(), respond(interaction).acknowledge()])

      expect(interaction.deferReply).toHaveBeenCalledTimes(1)
    })

    it('treats 40060 as acknowledged elsewhere', async () => {
      const interaction = command()
      interaction.deferReply.mockRejectedValueOnce(createDiscordError(40060))

      await respond(interaction).acknowledge()

      expect(respond(interaction).state).toBe('replied')
    })
  })

  describe('modal()', () => {
    const modal = new ModalBuilder().setCustomId('m').setTitle('Title')

    it('shows a modal while unanswered', async () => {
      const interaction = command()

      await respond(interaction).modal(modal)

      expect(interaction.showModal).toHaveBeenCalledWith(modal)
    })

    it('throws a clear error once acknowledged, rather than failing at Discord', async () => {
      const interaction = command()
      await respond(interaction).acknowledge()

      await expect(respond(interaction).modal(modal)).rejects.toThrow('A modal must be the first response')
    })
  })

  describe('delete()', () => {
    it('refuses before any answer', async () => {
      await expect(respond(command()).delete()).rejects.toThrow('There is no answer to delete')
    })

    it('deletes the reply', async () => {
      const interaction = command()
      await respond(interaction).send('bye')

      await respond(interaction).delete()

      expect(interaction.deleteReply).toHaveBeenCalledTimes(1)
    })
  })

  describe('attachments', () => {
    const cdn = 'https://cdn.discordapp.com/attachments/1/2/card.png?ex=1'

    it('points a Discord CDN image at attachment:// when the edited message keeps the file', async () => {
      const interaction = command()
      await respond(interaction).acknowledge()

      await respond(interaction).edit({
        embeds: [{ image: { url: cdn }, thumbnail: { url: 'https://example.com/a.png' } }],
        files: [{ attachment: Buffer.from(''), name: 'card.png' }],
      })

      const [embed] = sent(interaction.editReply).embeds ?? []
      expect(embed.image?.url).toBe('attachment://card.png')
      expect(embed.thumbnail?.url).toBe('https://example.com/a.png')
    })

    it('leaves a CDN image alone when the file is not kept', async () => {
      const interaction = command()
      await respond(interaction).acknowledge()

      await respond(interaction).edit({ embeds: [{ image: { url: cdn } }] })

      expect(sent(interaction.editReply).embeds?.[0].image?.url).toBe(cdn)
    })

    it('rewrites Components V2 media the message keeps', async () => {
      const message = messageWith({ flags: IsComponentsV2 })
      Object.assign(message, { attachments: new Map([['1', { name: 'card.png' }]]) })
      const interaction = button(message)
      await respond(interaction).acknowledge()

      await respond(interaction).edit({
        components: [{ type: ComponentType.MediaGallery, items: [{ media: { url: cdn } }] }] as never,
      })

      const [gallery] = sent(interaction.editReply).components as unknown as { items: { media: { url: string } }[] }[]
      expect(gallery.items[0].media.url).toBe('attachment://card.png')
    })
  })

  describe('install contexts', () => {
    const fifteenMinutesAgo = Date.now() - 16 * 60 * 1000

    it('edits through the channel only once the token has expired, where the bot is present', async () => {
      const message = messageWith()
      const interaction = button(message)
      Object.assign(interaction, { createdTimestamp: fifteenMinutesAgo, context: InteractionContextType.Guild })
      await respond(interaction).acknowledge()
      interaction.editReply.mockRejectedValueOnce(createDiscordError(50027))

      await respond(interaction).send('late')

      expect(message.edit).toHaveBeenCalledWith(expect.objectContaining({ content: 'late' }))
    })

    it('never uses the channel in a server without the bot', async () => {
      const message = messageWith()
      const interaction = createMockInteraction(ButtonInteraction, {
        message,
        context: InteractionContextType.Guild,
        authorizingIntegrationOwners: { [ApplicationIntegrationType.UserInstall]: 'user' } as never,
      })
      Object.assign(interaction, { createdTimestamp: fifteenMinutesAgo })
      await respond(interaction).acknowledge()
      interaction.editReply.mockRejectedValueOnce(createDiscordError(50027))

      await expect(respond(interaction).send('late')).rejects.toThrow('50027')
      expect(message.edit).not.toHaveBeenCalled()
    })

    it('rethrows a token error while the token is still valid', async () => {
      const message = messageWith()
      const interaction = button(message)
      await respond(interaction).acknowledge()
      interaction.editReply.mockRejectedValueOnce(createDiscordError(50027))

      await expect(respond(interaction).send('early')).rejects.toThrow()
      expect(message.edit).not.toHaveBeenCalled()
    })
  })

  describe('error()', () => {
    const describedAs = (payload: Payload) => {
      const [embed] = payload.embeds ?? []
      expect(embed.color).toBe(resolveColor(Theme.errorColor))
      return embed.description
    }

    it('replies privately to an unanswered interaction', async () => {
      const interaction = command()

      await respond(interaction).error(new Error('x'))

      expect(describedAs(sent(interaction.reply))).toBe('An error occurred while executing the command.')
      expect(sent(interaction.reply).flags).toBe(Ephemeral)
    })

    it("edits a command's deferred reply into the error", async () => {
      const interaction = command()
      await respond(interaction).acknowledge()

      await respond(interaction).error(new Error('x'), { message: 'Profile not found.' })

      expect(describedAs(sent(interaction.editReply))).toBe('Profile not found.')
      expect(interaction.followUp).not.toHaveBeenCalled()
    })

    it("keeps a private error off a public deferred reply: delete, then follow up", async () => {
      const interaction = command()
      await respond(interaction).acknowledge()
      const steps: string[] = []
      interaction.deleteReply.mockImplementation(async () => void steps.push('delete'))
      interaction.followUp.mockImplementation(async () => {
        steps.push('followUp')
        return createMockMessage() as never
      })

      await respond(interaction).error(new GuardDeniedError('Owners only.'), { message: 'Owners only.', visibility: 'private' })

      expect(steps).toEqual(['delete', 'followUp'])
      expect(sent(interaction.followUp).flags).toBe(Ephemeral)
      expect(interaction.editReply).not.toHaveBeenCalled()
    })

    it('adds the error to a private component message, keeping its components and embeds', async () => {
      const row = { type: ComponentType.ActionRow, components: [] }
      const interaction = button(messageWith({ flags: Ephemeral, embeds: [{ description: 'card' }], components: [row] }))
      await respond(interaction).acknowledge()

      await respond(interaction).error(new Error('x'))

      const payload = sent(interaction.editReply)
      expect(payload.components).toEqual([row])
      expect(payload.embeds?.map(embed => embed.description)).toEqual(['card', 'An error occurred while executing the command.'])
      expect(interaction.followUp).not.toHaveBeenCalled()
    })

    it('follows up privately on a public component, never editing the clicked message', async () => {
      const interaction = button()
      await respond(interaction).acknowledge()

      await respond(interaction).error(new Error('x'))

      expect(interaction.editReply).not.toHaveBeenCalled()
      expect(sent(interaction.followUp).flags).toBe(Ephemeral)
    })

    it('answers a Components V2 message with a container carrying MeoCord’s id', async () => {
      const interaction = createMockInteraction(StringSelectMenuInteraction, { message: messageWith({ flags: IsComponentsV2 }) })
      await respond(interaction).acknowledge()

      await respond(interaction).error(new Error('x'))

      const payload = sent(interaction.followUp)
      expect(payload.flags).toBe(Ephemeral | IsComponentsV2)
      expect(payload.components?.[0]).toMatchObject({ type: ComponentType.Container, id: RENDERED_CONTAINER_ID })
      expect(payload).not.toHaveProperty('embeds')
    })

    it('follows up once after 40060, and never throws', async () => {
      const interaction = command()
      interaction.reply.mockRejectedValueOnce(createDiscordError(40060))
      interaction.followUp.mockRejectedValueOnce(createDiscordError(10062))

      await expect(respond(interaction).error(new Error('x'))).resolves.toBeUndefined()
      expect(interaction.followUp).toHaveBeenCalledTimes(1)
    })

    it("styles the error with the client's presenter", async () => {
      const interaction = command()
      const error = new Error('x')
      const presenter = {
        loading: () => ({ text: 'loading' }),
        error: vi.fn(() => ({ text: 'Branded.', color: Theme.warningColor })),
      }
      setPresenter(interaction.client, presenter)

      await respond(interaction).error(error, { message: 'Words.' })

      expect(presenter.error).toHaveBeenCalledWith(
        expect.objectContaining({ interaction, mode: 'embed' }),
        { message: 'Words.', error },
      )
      expect(sent(interaction.reply).embeds?.[0]).toMatchObject({ description: 'Branded.', color: resolveColor(Theme.warningColor) })
    })
  })

  it('is reachable from the ExecutionContext of an interaction, and absent for a message', () => {
    const interaction = command()

    expect(new UnroutedExecutionContext([interaction]).response).toBe(respond(interaction))
    expect(new UnroutedExecutionContext([createMockMessage()]).response).toBeUndefined()
  })

  it('reports what it did through getResponse()', async () => {
    const interaction = button()
    await respond(interaction).acknowledge()
    await respond(interaction).send('done')

    expect(getResponse(interaction)).toMatchObject({ state: 'replied', sent: true })
    expect(getResponse(interaction).calls.map(call => call.method)).toEqual(['deferUpdate', 'editReply'])
    expect(getResponse(command())).toEqual({ state: 'unanswered', sent: false, calls: [] })
  })
})
