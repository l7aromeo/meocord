import {
  type AutocompleteInteraction,
  type Interaction,
  type InteractionReplyOptions,
  MessageFlagsBitField,
  type RepliableInteraction,
} from 'discord.js'
import { type ExecutionContext } from '@src/common/execution-context.js'
import { CommandNotFoundError, GuardDeniedError, ValidationError } from '@src/common/errors.js'
import { type Logger } from '@src/common/logger.js'
import { EmbedUtil } from '@src/util/index.js'
import { describeInteraction } from '@src/util/interaction.util.js'

/** Answers an error no filter handled, for the call `context` describes. Never throws. */
export type Fallback = (error: unknown, context: ExecutionContext) => Promise<void>

/** Who sees an error answer: `'reply'` may edit a public deferred reply, `'private'` never does. */
type Visibility = 'reply' | 'private'

const UNKNOWN_INTERACTION = 10062
const ALREADY_ACKNOWLEDGED = 40060

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
}

/** Closes an autocomplete menu that nothing else answered. Never throws. */
export async function closeAutocomplete(interaction: AutocompleteInteraction, logger: Logger): Promise<void> {
  if (interaction.responded) return
  try {
    await interaction.respond([])
  } catch (error) {
    // The three-second window may already have closed, which is not actionable.
    logger.debug(`Could not close autocomplete window: ${String(error)}`)
  }
}

/**
 * Whether the interaction's deferred reply is a message of its own, safe to edit or delete. A component
 * or a modal from a message may have been deferred with `deferUpdate`, where editing would change the
 * message the user clicked.
 */
function ownsReply(interaction: RepliableInteraction): boolean {
  return interaction.isCommand() || (interaction.isModalSubmit() && !interaction.isFromMessage())
}

async function deliver(interaction: RepliableInteraction, payload: InteractionReplyOptions, visibility: Visibility) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply(payload)
  } else if (interaction.deferred && !interaction.replied && ownsReply(interaction)) {
    if (visibility === 'reply') {
      await interaction.editReply({ embeds: payload.embeds })
    } else {
      // Delete first: a follow-up to a deferred, unsent reply would become a public edit of it.
      await interaction.deleteReply()
      await interaction.followUp(payload)
    }
  } else {
    await interaction.followUp(payload)
  }
}

/**
 * Tells the user something went wrong, choosing the step from the interaction's state. The one place
 * the fallback answers, so the response layer can replace it without touching filters. Never throws.
 */
export async function answerError(
  interaction: Interaction,
  text: string,
  visibility: Visibility,
  logger: Logger,
): Promise<void> {
  if (!interaction.isRepliable()) return
  const payload: InteractionReplyOptions = {
    embeds: [EmbedUtil.createErrorEmbed(text)],
    flags: MessageFlagsBitField.Flags.Ephemeral,
  }

  try {
    await deliver(interaction, payload, visibility)
  } catch (error) {
    if (errorCode(error) !== ALREADY_ACKNOWLEDGED) {
      logger.debug(`Could not deliver the error reply: ${String(error)}`)
      return
    }
    // Answered by something discord.js did not see, such as a raw API call: follow up once instead.
    try {
      await interaction.followUp(payload)
    } catch (retryError) {
      logger.debug(`Could not deliver the error reply: ${String(retryError)}`)
    }
  }
}

function describeCall(context: ExecutionContext): string {
  const handler = context.getHandlerName()
  const message = context.getMessage()
  const reaction = context.getReaction()
  const subject = message
    ? `message "${message.content}"`
    : reaction
      ? `reaction "${reaction.emoji.name}"`
      : `${context.getType()}`
  return handler ? `${subject} for method "${handler}"` : subject
}

/**
 * The built-in fallback: logs an error no filter handled, then answers the interaction if it can
 * still take an answer. Messages, reactions and events are only logged.
 */
export function createFallback(logger: Logger): Fallback {
  return async (error, context) => {
    const interaction = context.getInteraction()
    if (!interaction) {
      logger.error(`Error handling ${describeCall(context)}:`, error)
      return
    }

    if (interaction.isAutocomplete()) {
      logger.error(`Error handling ${describeInteraction(interaction)}:`, error)
      await closeAutocomplete(interaction, logger)
      return
    }

    if (errorCode(error) === UNKNOWN_INTERACTION) {
      logger.warn(`${describeInteraction(interaction)} expired before it could be answered:`, error)
      return
    }

    if (error instanceof CommandNotFoundError) {
      logger.warn(error.message)
      await answerError(interaction, 'Command not found!', 'reply', logger)
    } else if (error instanceof GuardDeniedError) {
      logger.debug(`Denied ${describeInteraction(interaction)}: ${error.message}`)
      await answerError(interaction, error.message, 'private', logger)
    } else if (error instanceof ValidationError) {
      // The caller's own input is wrong: only they need to see which part, and it is no fault to log.
      logger.debug(`Invalid input for ${describeInteraction(interaction)}: ${error.message}`)
      await answerError(interaction, error.message, 'private', logger)
    } else {
      logger.error(`Error handling ${describeInteraction(interaction)}:`, error)
      await answerError(interaction, 'An error occurred while executing the command.', 'reply', logger)
    }
  }
}
