import {
  type APIEmbed,
  type BitFieldResolvable,
  type Interaction,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type Message,
  MessageFlags,
  type MessageFlagsResolvable,
  type ModalComponentData,
  type JSONEncodable,
  type APIModalInteractionResponseCallbackData,
  type RepliableInteraction,
} from 'discord.js'
import { Logger } from '@src/common/logger.js'
import { getInstallContext, type InstallContext } from '@src/common/response/install-context.js'
import {
  flagNames,
  hasComponentsV2,
  hasEphemeral,
  resolveFlags,
  type ResponseStep,
} from '@src/common/response/flags.js'
import { keptAttachmentNames, rewriteAttachmentUrls } from '@src/common/response/attachments.js'
import { presenterFor, renderContainer, renderEmbed } from '@src/common/response/presenter.js'
import { type ResponseView } from '@src/interface/index.js'

/** The flags a message sent through `respond()` can ask for. */
export type ResponseFlags = BitFieldResolvable<
  'Ephemeral' | 'SuppressEmbeds' | 'SuppressNotifications' | 'IsComponentsV2',
  MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds | MessageFlags.SuppressNotifications | MessageFlags.IsComponentsV2
>

/** The flags an edit through `respond()` can ask for. */
export type ResponseEditFlags = BitFieldResolvable<
  'SuppressEmbeds' | 'IsComponentsV2',
  MessageFlags.SuppressEmbeds | MessageFlags.IsComponentsV2
>

/** A message sent with `send()` or `followUp()`: text, or reply options with the flags it can take. */
export type ResponsePayload = string | (Omit<InteractionReplyOptions, 'flags' | 'withResponse'> & { flags?: ResponseFlags })

/** An edit made with `edit()`: text, or edit options with the flags an edit can take. */
export type ResponseEditPayload = string | (Omit<InteractionEditReplyOptions, 'flags'> & { flags?: ResponseEditFlags })

/** Where an interaction's answer stands. */
export type ResponsePhase = 'unanswered' | 'deferred' | 'replied'

/** Options for {@link ResponseState.error}. */
export interface ResponseErrorOptions {
  /** What the user is told. Defaults to a generic sentence. */
  message?: string

  /**
   * `'reply'` (default) may turn a public deferred reply into the error; `'private'` never shows it to
   * anyone but the user who made the call.
   */
  visibility?: 'reply' | 'private'
}

/** One Discord call made through a response state, as the testing helpers report it. */
export interface ResponseCall {
  method:
    | 'deferReply'
    | 'deferUpdate'
    | 'reply'
    | 'update'
    | 'editReply'
    | 'followUp'
    | 'deleteReply'
    | 'showModal'
    | 'message.edit'
  payload?: unknown
}

const DEFAULT_ERROR = 'An error occurred while executing the command.'
const ALREADY_ACKNOWLEDGED = 40060
const TOKEN_EXPIRED = new Set([50027, 10015])
const TOKEN_LIFETIME_MS = 15 * 60 * 1000

const logger = new Logger('Response')
const development = () => process.env.NODE_ENV !== 'production'

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
}

/** Whether the interaction's reply is a message of its own rather than the message a component sits on. */
function answersWithOwnMessage(interaction: RepliableInteraction): boolean {
  return interaction.isCommand() || (interaction.isModalSubmit() && !interaction.isFromMessage())
}

type Body = Record<string, unknown> & {
  flags?: MessageFlagsResolvable
  components?: unknown[]
  embeds?: unknown[]
  files?: unknown[]
  attachments?: unknown[]
}

function toBody(payload: ResponsePayload | ResponseEditPayload): Body {
  return typeof payload === 'string' ? { content: payload } : { ...(payload as Body) }
}

/** Drops what a Components V2 message cannot carry. */
function forMode(body: Body, v2: boolean): Body {
  if (!v2) return body
  const { content: _content, embeds: _embeds, ...rest } = body
  return rest
}

/**
 * How one interaction is answered: the single place its replies, edits and follow-ups go through, so
 * each call picks the right Discord method for where the answer stands. Get it with `respond()`.
 */
export class ResponseState {
  /** Where the interaction happened, and whether the bot can reach the channel there. */
  readonly location: InstallContext

  private phase: ResponsePhase = 'unanswered'
  private acknowledging?: Promise<void>
  private v2: boolean
  private lastMessage?: Message
  private readonly calls: ResponseCall[] = []

  private snapshot?: { components: unknown[]; embeds: APIEmbed[] }

  constructor(readonly interaction: RepliableInteraction) {
    this.location = getInstallContext(interaction)
    const message = 'message' in interaction ? interaction.message : undefined
    this.v2 = Boolean(message?.flags?.has(MessageFlags.IsComponentsV2))
  }

  /** Where the answer stands, re-read from the interaction so answers made around this state count. */
  get state(): ResponsePhase {
    this.sync()
    return this.phase
  }

  /** The message this state last sent or edited, or the message a component is on. Read-only: edit through the state. */
  get message(): Message | undefined {
    return this.lastMessage ?? ('message' in this.interaction ? (this.interaction.message ?? undefined) : undefined)
  }

  /** The components and embeds of the message before `@Defer` locked it; `undefined` until then. */
  get original(): { readonly components: readonly unknown[]; readonly embeds: readonly APIEmbed[] } | undefined {
    return this.snapshot
  }

  /** The Discord calls made through this state, for tests. */
  get history(): readonly ResponseCall[] {
    return this.calls
  }

  private sync(): void {
    if (this.interaction.replied) this.phase = 'replied'
    else if (this.interaction.deferred && this.phase === 'unanswered') this.phase = 'deferred'
  }

  private record(method: ResponseCall['method'], payload?: unknown): void {
    this.calls.push({ method, payload })
  }

  private flagsFor(step: ResponseStep, requested: MessageFlagsResolvable | undefined, v2 = this.v2): number {
    const { flags, dropped } = resolveFlags(step, requested, v2)
    if (dropped && development()) {
      logger.warn(`Dropped flags ${flagNames(dropped).join(', ')}, which a ${step} cannot take.`)
    }
    return flags
  }

  /**
   * Acknowledges the interaction without answering it yet: a deferred reply for a command, and an
   * invisible deferred update for a component or a modal from a message. Does nothing once answered,
   * and concurrent calls share one acknowledgement.
   *
   * @param options - `ephemeral` to make a command's deferred reply private.
   */
  acknowledge(options: { ephemeral?: boolean } = {}): Promise<void> {
    this.sync()
    if (this.phase !== 'unanswered') return this.acknowledging ?? Promise.resolve()
    this.acknowledging ??= this.runAcknowledge(options).finally(() => this.sync())
    return this.acknowledging
  }

  private async runAcknowledge({ ephemeral }: { ephemeral?: boolean }): Promise<void> {
    try {
      if (answersWithOwnMessage(this.interaction)) {
        const flags = this.flagsFor('deferReply', ephemeral ? MessageFlags.Ephemeral : 0)
        this.record('deferReply', { flags })
        await this.interaction.deferReply({ flags })
      } else if ('deferUpdate' in this.interaction) {
        this.record('deferUpdate')
        await this.interaction.deferUpdate()
      }
      this.phase = 'deferred'
    } catch (error) {
      // Acknowledged elsewhere, which discord.js did not see: the interaction is answered either way.
      if (errorCode(error) !== ALREADY_ACKNOWLEDGED) throw error
      this.phase = 'replied'
    }
  }

  /**
   * Sends the answer: a reply to an unanswered command, an update of an unanswered component's
   * message, and an edit once the interaction is deferred or replied. A second `send()` edits again.
   *
   * @param payload - Text, or reply options.
   * @returns The message sent or edited, when Discord returns it.
   */
  async send(payload: ResponsePayload): Promise<Message | undefined> {
    await this.acknowledging
    this.sync()
    const body = toBody(payload)
    if (this.phase !== 'unanswered') return this.editMessage(body)
    return answersWithOwnMessage(this.interaction) ? this.reply(body) : this.update(body)
  }

  /**
   * Edits the answer, routed as `send()` is: an edit once the interaction is answered.
   *
   * @param payload - Text, or edit options.
   * @returns The edited message, when Discord returns it.
   */
  edit(payload: ResponseEditPayload): Promise<Message | undefined> {
    return this.send(payload as ResponsePayload)
  }

  /**
   * Sends another message after the answer. Before any answer it is the first reply. While a command's
   * reply is deferred and nothing is sent yet, Discord turns a follow-up into the deferred reply and
   * ignores its flags, so it is sent as that edit.
   *
   * @param payload - Text, or reply options; `Ephemeral` makes the follow-up private.
   * @returns The message sent, when Discord returns it.
   */
  async followUp(payload: ResponsePayload): Promise<Message | undefined> {
    await this.acknowledging
    this.sync()
    const body = toBody(payload)
    if (this.phase === 'unanswered') return this.reply(body)
    if (this.phase === 'deferred' && answersWithOwnMessage(this.interaction)) {
      if (hasEphemeral(Number(body.flags ?? 0)) && development()) {
        logger.warn('A follow-up to a deferred, unsent reply becomes that reply, so its Ephemeral flag has no effect.')
      }
      return this.editMessage(body)
    }
    const flags = this.flagsFor('followUp', body.flags, false)
    const sent = forMode(body, hasComponentsV2(flags))
    this.record('followUp', { ...sent, flags })
    return (await this.interaction.followUp({ ...sent, flags } as InteractionReplyOptions)) as Message
  }

  /** Deletes the answer: the reply, or for a component deferred without a reply of its own, its message. */
  async delete(): Promise<void> {
    await this.acknowledging
    this.sync()
    if (this.phase === 'unanswered') throw new Error('There is no answer to delete: the interaction has not been answered.')
    this.record('deleteReply')
    await this.interaction.deleteReply()
  }

  /**
   * Shows a modal. A modal must be the interaction's first response, so this throws once the
   * interaction is acknowledged, rather than failing at Discord.
   *
   * @param modal - The modal to show.
   */
  async modal(modal: JSONEncodable<APIModalInteractionResponseCallbackData> | ModalComponentData): Promise<void> {
    this.sync()
    if (this.phase !== 'unanswered' || this.acknowledging) {
      throw new Error('A modal must be the first response to an interaction, and this one is already acknowledged.')
    }
    if (!('showModal' in this.interaction)) throw new Error('This interaction cannot show a modal.')
    this.record('showModal', modal)
    await this.interaction.showModal(modal)
    this.phase = 'replied'
  }

  private async reply(body: Body): Promise<Message | undefined> {
    const flags = this.flagsFor('reply', body.flags, false)
    this.v2 = hasComponentsV2(flags)
    const sent = forMode(body, this.v2)
    this.record('reply', { ...sent, flags })
    const response = await this.interaction.reply({ ...sent, flags, withResponse: true } as InteractionReplyOptions & {
      withResponse: true
    })
    this.phase = 'replied'
    this.lastMessage = response?.resource?.message ?? this.lastMessage
    return this.lastMessage
  }

  private async update(body: Body): Promise<Message | undefined> {
    if (!('update' in this.interaction)) return this.reply(body)
    const flags = this.flagsFor('update', body.flags)
    this.v2 ||= hasComponentsV2(flags)
    const sent = this.withAttachments(forMode(body, this.v2))
    this.record('update', { ...sent, flags })
    const response = await this.interaction.update({ ...sent, flags, withResponse: true } as never)
    this.phase = 'replied'
    this.lastMessage = (response as { resource?: { message?: Message } })?.resource?.message ?? this.lastMessage
    return this.lastMessage
  }

  private withAttachments(body: Body): Body {
    return rewriteAttachmentUrls(body, keptAttachmentNames(body, this.message?.attachments?.values() ?? []))
  }

  /** Edits the answer through the interaction, and through the channel only once its token has expired. */
  private async editMessage(body: Body): Promise<Message | undefined> {
    const flags = this.flagsFor('edit', body.flags)
    this.v2 ||= hasComponentsV2(flags)
    const sent = { ...this.withAttachments(forMode(body, this.v2)), flags }
    this.record('editReply', sent)
    try {
      this.lastMessage = await this.interaction.editReply(sent as InteractionEditReplyOptions)
    } catch (error) {
      const message = this.message
      const expired = Date.now() - this.interaction.createdTimestamp >= TOKEN_LIFETIME_MS
      if (!TOKEN_EXPIRED.has(errorCode(error) as number) || !expired || !this.location.botInstalled || !message) throw error
      this.record('message.edit', sent)
      this.lastMessage = await message.edit(sent as never)
    }
    this.phase = 'replied'
    return this.lastMessage
  }

  private render(view: ResponseView, v2: boolean): Body {
    return v2
      ? { components: [renderContainer(view)], flags: MessageFlags.IsComponentsV2 }
      : { embeds: [renderEmbed(view)] }
  }

  /**
   * Presents an error, styled by the application's presenter, and never throws; a delivery failure is
   * logged at debug level.
   *
   * - Unanswered: a private reply.
   * - A command whose reply is deferred: `'reply'` edits that reply into the error; `'private'`
   *   deletes it, then follows up privately.
   * - A component on a private (ephemeral) message: the error is added to that message.
   * - Otherwise: a private follow-up, never an edit of the message the user clicked.
   *
   * @param error - The error, handed to the presenter so it can style it by kind.
   * @param options - What the user is told, and who sees it.
   */
  async error(error: unknown, { message = DEFAULT_ERROR, visibility = 'reply' }: ResponseErrorOptions = {}): Promise<void> {
    try {
      await this.acknowledging?.catch(() => undefined)
      await this.presentError(error, message, visibility)
    } catch (deliveryError) {
      if (errorCode(deliveryError) !== ALREADY_ACKNOWLEDGED) {
        logger.debug(`Could not deliver the error reply: ${String(deliveryError)}`)
        return
      }
      // Answered by something discord.js did not see: follow up once instead.
      this.phase = 'replied'
      try {
        await this.followUp(this.privateError(error, message))
      } catch (retryError) {
        logger.debug(`Could not deliver the error reply: ${String(retryError)}`)
      }
    }
  }

  private view(error: unknown, message: string, v2: boolean): ResponseView {
    const presenter = presenterFor(this.interaction.client)
    return presenter.error({ interaction: this.interaction as Interaction, locale: this.interaction.locale, mode: v2 ? 'v2' : 'embed' }, { message, error })
  }

  private privateError(error: unknown, message: string): ResponsePayload {
    const body = this.render(this.view(error, message, this.v2), this.v2)
    return { ...body, flags: Number(body.flags ?? 0) | MessageFlags.Ephemeral } as ResponsePayload
  }

  private async presentError(error: unknown, message: string, visibility: 'reply' | 'private'): Promise<void> {
    this.sync()
    if (this.phase === 'unanswered') {
      await this.reply(toBody(this.privateError(error, message)))
      return
    }

    if (answersWithOwnMessage(this.interaction)) {
      if (this.phase === 'deferred' && visibility === 'reply') {
        await this.editMessage(this.render(this.view(error, message, this.v2), this.v2))
        return
      }
      if (this.phase === 'deferred') {
        // Delete first: a follow-up to a deferred, unsent reply would become a public edit of it.
        this.record('deleteReply')
        await this.interaction.deleteReply()
        this.phase = 'replied'
      }
      await this.followUp(this.privateError(error, message))
      return
    }

    const current = this.message
    if (current?.flags?.has(MessageFlags.Ephemeral)) {
      await this.editMessage(this.appendError(current, this.view(error, message, this.v2)))
      return
    }
    await this.followUp(this.privateError(error, message))
  }

  /** The private message the component is on, as it was before loading, with the error added. */
  private appendError(current: Message, view: ResponseView): Body {
    const base = this.snapshot ?? {
      components: current.components.map(component => component.toJSON()),
      embeds: current.embeds.map(embed => embed.toJSON()),
    }
    return this.v2
      ? { components: [...base.components, renderContainer(view)] }
      : { components: base.components, embeds: [...base.embeds, renderEmbed(view)] }
  }
}

const states = new WeakMap<object, ResponseState>()

/**
 * The response state of an interaction: one per interaction, created on first use, through which its
 * replies, edits, follow-ups and errors go.
 *
 * Each call picks the Discord method from where the answer stands, re-read from the interaction, so
 * answers made directly with discord.js or by a collector still count. Answers use the interaction's
 * own methods, which work wherever the interaction happened, including user-installed apps in
 * servers and direct messages the bot is not in.
 *
 * @param interaction - A command, component or modal submission.
 * @returns The interaction's response state.
 *
 * @example
 * ```typescript
 * @Command('profile', CommandType.SLASH)
 * async profile(interaction: ChatInputCommandInteraction) {
 *   await respond(interaction).acknowledge()
 *   const card = await this.profiles.render(interaction.user.id)
 *   await respond(interaction).send({ embeds: [card] })
 * }
 * ```
 */
export function respond(interaction: Interaction): ResponseState {
  if (!interaction.isRepliable()) {
    throw new Error('respond() takes a command, component or modal submission; autocomplete answers with respond([]).')
  }
  let state = states.get(interaction)
  if (!state) states.set(interaction, (state = new ResponseState(interaction)))
  return state
}

/** The response state of an interaction, if `respond()` created one. */
export function existingResponse(interaction: object): ResponseState | undefined {
  return states.get(interaction)
}
