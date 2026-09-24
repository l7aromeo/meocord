import { type AutocompleteInteraction } from 'discord.js'
import { type ExecutionContext } from '@src/common/execution-context.js'
import { CommandNotFoundError, CooldownError, GuardDeniedError, ValidationError } from '@src/common/errors.js'
import { type Logger } from '@src/common/logger.js'
import { respond } from '@src/common/response/response-state.js'
import { describeInteraction } from '@src/util/interaction.util.js'

/** Answers an error no filter handled, for the call `context` describes. Never throws. */
export type Fallback = (error: unknown, context: ExecutionContext) => Promise<void>

const UNKNOWN_INTERACTION = 10062

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
 * The built-in fallback: logs an error no filter handled, then answers the interaction through
 * `respond(interaction).error()` if it can still take an answer. Messages, reactions and events are
 * only logged.
 */
export function createFallback(logger: Logger): Fallback {
  return async (error, context) => {
    const interaction = context.getInteraction()
    if (!interaction) {
      // A message sent too often is ignored, as a cooldown means; it is not a fault to report.
      if (error instanceof CooldownError) logger.debug(`Cooldown (${error.per}) skipped ${describeCall(context)}`)
      else logger.error(`Error handling ${describeCall(context)}:`, error)
      return
    }

    if (interaction.isAutocomplete()) {
      logger.error(`Error handling ${describeInteraction(interaction)}:`, error)
      await closeAutocomplete(interaction, logger)
      return
    }

    if (!interaction.isRepliable()) {
      logger.error(`Error handling ${describeInteraction(interaction)}:`, error)
      return
    }

    if (errorCode(error) === UNKNOWN_INTERACTION) {
      logger.warn(`${describeInteraction(interaction)} expired before it could be answered:`, error)
      return
    }

    if (error instanceof CommandNotFoundError) {
      logger.warn(error.message)
      await respond(interaction).error(error, { message: 'Command not found!' })
    } else if (error instanceof GuardDeniedError) {
      logger.debug(`Denied ${describeInteraction(interaction)}: ${error.message}`)
      await respond(interaction).error(error, { message: error.message, visibility: 'private' })
    } else if (error instanceof CooldownError) {
      logger.debug(`Cooldown (${error.per}) blocked ${describeInteraction(interaction)} for ${error.retryAfterMs} ms`)
      await respond(interaction).error(error, { message: error.message, visibility: 'private' })
    } else if (error instanceof ValidationError) {
      // The caller's own input is wrong: only they need to see which part, and it is no fault to log.
      logger.debug(`Invalid input for ${describeInteraction(interaction)}: ${error.message}`)
      await respond(interaction).error(error, { message: error.message, visibility: 'private' })
    } else {
      logger.error(`Error handling ${describeInteraction(interaction)}:`, error)
      await respond(interaction).error(error)
    }
  }
}
