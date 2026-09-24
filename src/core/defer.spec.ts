import { Container } from 'inversify'
import {
  type APIEmbed,
  ApplicationIntegrationType,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedType,
  InteractionContextType,
  type Message,
  MessageFlags,
  MessageFlagsBitField,
  ModalBuilder,
  ModalSubmitInteraction,
} from 'discord.js'
import { vi } from 'vitest'
import { Command, Controller, Defer, Guard, MessageHandler, UseGuard } from '@src/decorator/index.js'
import { CommandType, MetadataKey } from '@src/enum/index.js'
import { type GuardInterface } from '@src/interface/index.js'
import { GuardDeniedError } from '@src/common/errors.js'
import { respond } from '@src/common/response/response-state.js'
import { defaultPresenter, renderContainer, renderEmbed, RENDERED_CONTAINER_ID } from '@src/common/response/presenter.js'
import { MeoCordApp } from '@src/core/meocord.app.js'
import { createChatInputOptions, createMockInteraction, createMockMessage, getResponse } from '@src/testing/index.js'

const { Ephemeral, IsComponentsV2, SuppressNotifications } = MessageFlags
type Json = Record<string, unknown>
interface Payload { flags?: number; embeds?: APIEmbed[]; components?: Json[]; content?: string }

const row = (): Json => ({
  type: ComponentType.ActionRow,
  components: [
    { type: ComponentType.Button, style: 1, custom_id: 'card/refresh', label: 'Refresh', emoji: { name: '🔄' } },
    { type: ComponentType.Button, style: 2, custom_id: 'card/other', label: 'Other', disabled: true },
    { type: ComponentType.Button, style: 2, custom_id: 'card/next', label: 'Next' },
  ],
})

function messageWith(options: { flags?: number; embeds?: APIEmbed[]; components?: Json[] } = {}): Message {
  const message = createMockMessage()
  Object.assign(message, {
    flags: new MessageFlagsBitField(options.flags ?? 0),
    embeds: (options.embeds ?? [{ description: 'card' }]).map(embed => ({ toJSON: () => embed })),
    components: (options.components ?? [row()]).map(component => ({ toJSON: () => component })),
  })
  return message as unknown as Message
}

const loadingView = defaultPresenter.loading({} as never)
const calls = (interaction: object) => getResponse(interaction as never).calls.map(call => call.method)
const payloads = (interaction: object) => getResponse(interaction as never).calls.map(call => call.payload as Payload)
const buttonsOf = (payload: Payload) => (payload.components?.[0].components as Json[]) ?? []

let guardAllows: boolean | 'throw' | 'followUp' = true

@Guard()
class OwnerGuard implements GuardInterface {
  async canActivate(interaction: ButtonInteraction | ChatInputCommandInteraction): Promise<boolean> {
    log.push(`guard:deferred=${interaction.deferred}`)
    if (guardAllows === 'throw') throw new GuardDeniedError('Only the owner can use this.')
    if (guardAllows === 'followUp') {
      await respond(interaction).followUp({ content: 'Not yours.', flags: Ephemeral })
      return false
    }
    return guardAllows
  }
}

const log: string[] = []
let handlerBody: (interaction: ButtonInteraction | ChatInputCommandInteraction) => Promise<void> = async () => {}

@Controller()
class CardController {
  @Command('card', CommandType.SLASH)
  @UseGuard(OwnerGuard)
  @Defer()
  async card(interaction: ChatInputCommandInteraction) {
    await handlerBody(interaction)
  }

  @Command('secret', CommandType.SLASH)
  @Defer({ ephemeral: true })
  async secret(interaction: ChatInputCommandInteraction) {
    await handlerBody(interaction)
  }

  @Command('card/{action}', CommandType.BUTTON)
  @UseGuard(OwnerGuard)
  @Defer()
  async button(interaction: ButtonInteraction) {
    await handlerBody(interaction)
  }

  @Command('clicked/{action}', CommandType.BUTTON)
  @Defer({ disable: 'clicked' })
  async clickedOnly(interaction: ButtonInteraction) {
    await handlerBody(interaction)
  }

  @Command('fast/{action}', CommandType.BUTTON)
  @Defer({ mode: 'auto', suppressNotifications: true })
  async fast(interaction: ButtonInteraction) {
    await handlerBody(interaction)
  }

  @Command('form', CommandType.MODAL_SUBMIT)
  @Defer()
  async form(interaction: ModalSubmitInteraction) {
    await handlerBody(interaction as never)
  }
}

async function startApp() {
  const container = new Container()
  container.bind(CardController).toSelf().inSingletonScope()
  Reflect.defineMetadata(MetadataKey.Container, container, CardController)
  const listeners = new Map<string, (...args: unknown[]) => Promise<void>>()
  const client = {
    on: vi.fn((event: string, listener: (...args: unknown[]) => Promise<void>) => listeners.set(event, listener)),
    login: vi.fn().mockResolvedValue('token'),
    user: { setActivity: vi.fn() },
    application: null,
  }
  await new MeoCordApp([CardController], container, client as never, 't').start()
  return (interaction: unknown) => listeners.get('interactionCreate')!(interaction)
}

const contexts = [
  ['a server the bot was added to', InteractionContextType.Guild, { [ApplicationIntegrationType.GuildInstall]: 'g' }],
  ['a server the bot is not in', InteractionContextType.Guild, { [ApplicationIntegrationType.UserInstall]: 'u' }],
  ['a direct message with the bot', InteractionContextType.BotDM, { [ApplicationIntegrationType.UserInstall]: 'u' }],
  ['a private channel between users', InteractionContextType.PrivateChannel, { [ApplicationIntegrationType.UserInstall]: 'u' }],
] as const

beforeEach(() => {
  log.length = 0
  guardAllows = true
  handlerBody = async () => {}
})

describe.each(contexts)('@Defer in %s', (_where, context, owners) => {
  const where = { context, authorizingIntegrationOwners: owners }
  const slash = (commandName = 'card') => {
    const interaction = createMockInteraction(ChatInputCommandInteraction, { commandName, ...where })
    interaction.options = createChatInputOptions({})
    return interaction
  }
  const click = (options: { flags?: number; customId?: string } = {}) =>
    createMockInteraction(ButtonInteraction, {
      customId: options.customId ?? 'card/refresh',
      message: messageWith({ flags: options.flags }),
      ...where,
    })

  it('defers a command before its guards, and send() edits the deferred reply', async () => {
    const emit = await startApp()
    handlerBody = async interaction => void (await respond(interaction).send('done'))
    const interaction = slash()

    await emit(interaction)

    expect(log).toEqual(['guard:deferred=true'])
    expect(calls(interaction)).toEqual(['deferReply', 'editReply'])
  })

  it('locks a public card after its guards, then send() restores its components without the loading view', async () => {
    const emit = await startApp()
    handlerBody = async interaction => void (await respond(interaction).send({ embeds: [{ description: 'new card' }] }))
    const interaction = click()

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferUpdate', 'editReply', 'editReply'])
    const [, lock, answer] = payloads(interaction)
    expect(buttonsOf(lock).map(button => button.disabled)).toEqual([true, true, true])
    expect(buttonsOf(lock)[0].emoji).toEqual({ name: '⏳' })
    expect(lock.embeds).toEqual([{ description: 'card' }, renderEmbed(loadingView)])
    expect(answer.components).toEqual([row()])
    expect(answer.embeds).toEqual([{ description: 'new card' }])
  })

  it('locks a private card too, through the interaction', async () => {
    const emit = await startApp()
    const interaction = click({ flags: Ephemeral })

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferUpdate', 'editReply', 'editReply'])
    expect(payloads(interaction)[2]).toMatchObject({ components: [row()], embeds: [{ description: 'card' }] })
  })

  it('restores the card and follows up privately when the handler throws before answering', async () => {
    const emit = await startApp()
    handlerBody = async () => {
      throw new Error('failed')
    }
    const interaction = click()

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferUpdate', 'editReply', 'editReply', 'followUp'])
    expect(payloads(interaction)[2].components).toEqual([row()])
    expect(payloads(interaction)[3].flags).toBe(Ephemeral)
  })

  it('adds the error to a private card, restored', async () => {
    const emit = await startApp()
    handlerBody = async () => {
      throw new Error('failed')
    }
    const interaction = click({ flags: Ephemeral })

    await emit(interaction)

    const last = payloads(interaction).at(-1)!
    expect(last.components).toEqual([row()])
    expect(last.embeds?.map(embed => embed.description)).toEqual(['card', 'An error occurred while executing the command.'])
    expect(calls(interaction)).not.toContain('followUp')
  })

  it("edits a command's deferred reply into the error when it threw", async () => {
    const emit = await startApp()
    handlerBody = async () => {
      throw new Error('failed')
    }
    const interaction = slash()

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferReply', 'editReply'])
    expect(payloads(interaction)[1].embeds?.[0].description).toBe('An error occurred while executing the command.')
  })

  it('leaves no reply when a guard denies a command silently', async () => {
    const emit = await startApp()
    guardAllows = false
    const interaction = slash()

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferReply', 'deleteReply'])
  })

  it("sends no edit when a stranger's click is denied on a public card", async () => {
    const emit = await startApp()
    guardAllows = false
    const interaction = click()

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferUpdate'])
  })

  it('answers a guard that throws privately, without touching the card', async () => {
    const emit = await startApp()
    guardAllows = 'throw'
    const interaction = click()

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferUpdate', 'followUp'])
    expect(payloads(interaction)[1].flags).toBe(Ephemeral)
  })

  it('keeps a private error off a public deferred command: delete, then follow up', async () => {
    const emit = await startApp()
    guardAllows = 'throw'
    const interaction = slash()

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferReply', 'deleteReply', 'followUp'])
    expect(payloads(interaction)[2].embeds?.[0].description).toBe('Only the owner can use this.')
  })

  it('keeps the message of a guard that followed up before returning false', async () => {
    const emit = await startApp()
    guardAllows = 'followUp'
    const interaction = slash()

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferReply', 'editReply'])
  })

  it('makes a command’s deferred reply private with ephemeral', async () => {
    const emit = await startApp()
    const interaction = slash('secret')

    await emit(interaction)

    expect(payloads(interaction)[0].flags).toBe(Ephemeral)
  })

  it('treats a modal submitted from a command like a command, and one from a message like a component', async () => {
    const emit = await startApp()
    const fromCommand = createMockInteraction(ModalSubmitInteraction, { customId: 'form', ...where })
    const fromMessage = createMockInteraction(ModalSubmitInteraction, { customId: 'form', message: messageWith(), ...where })

    await emit(fromCommand)
    await emit(fromMessage)

    expect(calls(fromCommand)[0]).toBe('deferReply')
    expect(calls(fromMessage)).toEqual(['deferUpdate', 'editReply', 'editReply'])
  })
})

describe('@Defer', () => {
  const click = (customId: string, message = messageWith()) => createMockInteraction(ButtonInteraction, { customId, message })

  it('puts the card back when the handler returns without answering', async () => {
    const emit = await startApp()
    const interaction = click('card/refresh')

    await emit(interaction)

    expect(payloads(interaction)[2]).toEqual(expect.objectContaining({ components: [row()], embeds: [{ description: 'card' }] }))
  })

  it('does not restore over an edit something else made after the lock', async () => {
    const emit = await startApp()
    const interaction = click('card/refresh')
    interaction.fetchReply.mockResolvedValue(Object.assign(createMockMessage(), { components: [{ toJSON: () => ({ type: 1, components: [] }) }] }) as never)

    await emit(interaction)

    expect(calls(interaction)).toEqual(['deferUpdate', 'editReply'])
  })

  it('never re-enables a button that was disabled before, nor moves the loading emoji', async () => {
    const emit = await startApp()
    handlerBody = async interaction => void (await respond(interaction).send({ content: 'x' }))
    const interaction = click('card/next')

    await emit(interaction)

    const [, lock, answer] = payloads(interaction)
    expect(buttonsOf(lock)[2].emoji).toEqual({ name: '⏳' })
    expect(buttonsOf(lock)[0].emoji).toEqual({ name: '🔄' })
    expect(buttonsOf(answer)).toEqual(row().components)
  })

  it("disables only the clicked control with disable: 'clicked'", async () => {
    const emit = await startApp()
    const interaction = click('clicked/next', messageWith({ components: [{ ...row(), components: [{ type: 2, style: 1, custom_id: 'clicked/next' }, { type: 2, style: 1, custom_id: 'clicked/keep' }] }] }))

    await emit(interaction)

    expect(buttonsOf(payloads(interaction)[1]).map(button => button.disabled)).toEqual([true, undefined])
  })

  it('drops a loading view left behind by a crash before snapshotting', async () => {
    const emit = await startApp()
    const leftover = messageWith({ embeds: [{ description: 'card' }, renderEmbed(loadingView)] })
    const interaction = click('card/refresh', leftover)

    await emit(interaction)

    expect(payloads(interaction)[1].embeds).toEqual([{ description: 'card' }, renderEmbed(loadingView)])
    expect(getResponse(interaction).calls.length).toBe(3)
    expect(payloads(interaction)[2].embeds).toEqual([{ description: 'card' }])
  })

  // Discord returns every embed a bot sent with its type, which the rendered view does not carry
  it('drops a leftover loading view as Discord returns it, with its type', async () => {
    const emit = await startApp()
    const leftover = messageWith({ embeds: [{ description: 'card' }, { ...renderEmbed(loadingView), type: EmbedType.Rich }] })
    const interaction = click('card/refresh', leftover)

    await emit(interaction)

    expect(payloads(interaction)[1].embeds).toEqual([{ description: 'card' }, renderEmbed(loadingView)])
    expect(payloads(interaction)[2].embeds).toEqual([{ description: 'card' }])
  })

  it('drops a leftover loading container, and adds one, on a Components V2 card', async () => {
    const emit = await startApp()
    const card = { type: ComponentType.Container, components: [row()] }
    const leftover = { ...renderContainer(loadingView) }
    const interaction = click('card/refresh', messageWith({ flags: IsComponentsV2, components: [card, leftover] }))

    await emit(interaction)

    const [, lock, restore] = payloads(interaction)
    expect(lock.components?.at(-1)).toMatchObject({ id: RENDERED_CONTAINER_ID })
    expect(lock.components).toHaveLength(2)
    expect(lock.flags).toBe(IsComponentsV2)
    expect(restore.components).toEqual([card])
  })

  it('leaves the loading view out, still locking, when the card has 10 embeds', async () => {
    const emit = await startApp()
    const embeds = Array.from({ length: 10 }, (_, index) => ({ description: `e${index}` }))
    const interaction = click('card/refresh', messageWith({ embeds }))

    await emit(interaction)

    expect(payloads(interaction)[1].embeds).toEqual(embeds)
    expect(buttonsOf(payloads(interaction)[1])[0].disabled).toBe(true)
  })

  describe("mode: 'auto'", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('answers a fast handler with a single update, never deferring', async () => {
      vi.useFakeTimers({ now: Date.now() })
      const emit = await startApp()
      handlerBody = async interaction => void (await respond(interaction).send({ content: 'quick' }))
      const interaction = click('fast/go')
      Object.assign(interaction, { createdTimestamp: Date.now() })

      await emit(interaction)
      await vi.advanceTimersByTimeAsync(5_000)

      expect(calls(interaction)).toEqual(['update'])
    })

    it('acknowledges a slow handler after 1.5 s, capped at 2.5 s after the interaction was created', async () => {
      vi.useFakeTimers({ now: Date.now() })
      const emit = await startApp()
      let finish!: () => void
      handlerBody = () => new Promise<void>(resolve => (finish = resolve))
      const interaction = click('fast/go')
      Object.assign(interaction, { createdTimestamp: Date.now() - 2_000 })

      const done = emit(interaction)
      await vi.advanceTimersByTimeAsync(499)
      expect(calls(interaction)).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      expect(calls(interaction)[0]).toBe('deferUpdate')
      finish()
      await done
    })

    it('suppresses notifications on new messages when asked', async () => {
      const emit = await startApp()
      handlerBody = async interaction => void (await respond(interaction).followUp({ content: 'note' }))
      const interaction = click('fast/go')

      await emit(interaction)

      expect(payloads(interaction)[0].flags).toBe(SuppressNotifications)
    })
  })

  it('makes a modal under @Defer a clear error, since a modal must be the first response', async () => {
    const emit = await startApp()
    let failure: unknown
    handlerBody = async interaction => {
      await respond(interaction).modal(new ModalBuilder().setCustomId('m').setTitle('T')).catch(error => (failure = error))
    }

    await emit(click('card/refresh'))

    expect(String(failure)).toContain('A modal must be the first response')
  })

  it('refuses a message handler at decoration', () => {
    expect(() => {
      @Controller()
      class Messages {
        @Defer()
        @MessageHandler('hi')
        async hi(_message: Message) {}
      }
      return Messages
    }).toThrow('@Defer is for interaction handlers, but Messages.hi is a message handler')
  })
})
