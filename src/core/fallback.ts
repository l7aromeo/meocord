import { type AutocompleteInteraction, BaseInteraction, type Interaction, Message } from 'discord.js'
import { type ExecutionContext } from '@src/common/execution-context.js'
import { CommandNotFoundError, CooldownError, CooldownStoreError, GuardDeniedError, MessageUsageError, UserError, ValidationError } from '@src/common/errors.js'
import { type Logger } from '@src/common/logger.js'
import { respond } from '@src/common/response/response-state.js'
import { describeInteraction } from '@src/util/interaction.util.js'
import { getMessageHandlers } from '@src/decorator/controller.decorator.js'

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

/** Replies to the message a `UserError` came from, without pinging its author; only logs one from a reaction or event. */
async function tellAuthor(context: ExecutionContext, error: UserError, logger: Logger): Promise<void> {
  logger.debug(`Refused ${describeCall(context)}: ${error.message}`)
  const message = context.getMessage()
  if (!message) return
  try {
    await message.reply({ content: error.message, allowedMentions: { repliedUser: false } })
  } catch (replyError) {
    logger.debug(`Could not reply to the message: ${String(replyError)}`)
  }
}

/** Whether the call is a message command: a `@MessageHandler` with a pattern, not a listener for every message. */
function isCommand(context: ExecutionContext): boolean {
  const controller = context.getController()
  const method = context.getHandlerName()
  return controller !== undefined && getMessageHandlers(controller.prototype).some(handler => handler.method === method && handler.pattern !== undefined)
}

/** How long a reply showing a command's usage stays, in seconds, when the app does not say. */
export const DEFAULT_USAGE_REPLY_SECONDS = 10

/**
 * Replies to a message with what the command answers it, its usage, a guard's reason or what is wrong with
 * the input, then deletes the reply after `seconds`, unless `0`. A reply or deletion that fails, for a missing
 * permission or a message already gone, is logged and left.
 */
async function answerUsage(error: Error, context: ExecutionContext, logger: Logger, seconds: number): Promise<void> {
  const message = context.getMessage()
  if (!message) return
  try {
    const reply = await message.reply({ content: error.message, allowedMentions: { repliedUser: false, parse: [] } })
    if (seconds > 0) {
      setTimeout(() => {
        reply.delete().catch(failure => logger.debug(`Could not delete a reply to a command: ${String(failure)}`))
      }, seconds * 1000).unref?.()
    }
  } catch (failure) {
    logger.debug(`Could not reply to a command: ${String(failure)}`)
  }
}

/**
 * The built-in fallback: logs an error no filter handled, then answers the interaction through
 * `respond(interaction).error()` if it can still take an answer. A message that names a command but does
 * not fit it is answered with the command's usage, and one a guard denies or validation refuses with the
 * reason, each deleted after `usageReplySeconds()` seconds; a listener's denial only at debug level, since
 * its guard filters messages; one a `UserError` refused with that error's message; other errors of messages,
 * reactions and events are only logged.
 */
export function createFallback(logger: Logger, usageReplySeconds: () => number | undefined = () => undefined): Fallback {
  return async (error, context) => {
    const interaction = context.getInteraction()
    if (!interaction) {
      if (error instanceof MessageUsageError) {
        // With no prefix or mention the message may be chat that happens to begin with a command's words
        if (error.quiet) logger.debug(`Usage not shown for ${describeCall(context)}: ${error.message}`)
        else await answerUsage(error, context, logger, usageReplySeconds() ?? DEFAULT_USAGE_REPLY_SECONDS)
        return
      }
      if ((error instanceof GuardDeniedError || error instanceof ValidationError) && context.getMessage()) {
        logger.debug(`${error instanceof GuardDeniedError ? 'Denied' : 'Invalid input for'} ${describeCall(context)}: ${error.message}`)
        // A command's sender addressed the bot, so is told why, as with the usage; a listener's guard only filters
        if (isCommand(context)) await answerUsage(error, context, logger, usageReplySeconds() ?? DEFAULT_USAGE_REPLY_SECONDS)
        return
      }
      // A message sent too often is ignored, as a cooldown means; it is not a fault to report.
      if (error instanceof CooldownError) logger.debug(`Cooldown (${error.per}) skipped ${describeCall(context)}`)
      // Logged once per outage where the store failed, rather than for every call it refused
      else if (error instanceof CooldownStoreError) logger.debug(`Cooldown store down; skipped ${describeCall(context)}`)
      else if (error instanceof UserError) await tellAuthor(context, error, logger)
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
    } else if (error instanceof CooldownStoreError) {
      logger.debug(`Cooldown store down; refused ${describeInteraction(interaction)}`)
      await respond(interaction).error(error, { message: error.message, visibility: 'private' })
    } else if (error instanceof UserError) {
      // The caller's own mistake, which only they need to see, and no fault to log
      logger.debug(`Refused ${describeInteraction(interaction)}: ${error.message}`)
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

/**
 * Whether the fallback answers `error`, raised for `call`, as the user's own outcome rather than a fault:
 * one it handles below error level. It mirrors `createFallback`'s branches, which fallback.spec pins pair
 * by pair. An interaction that expired is only warned about, but counts as a fault: it is a timing failure.
 */
export function isUserOutcome(error: unknown, call: unknown): boolean {
  if (!(call instanceof BaseInteraction)) {
    const answered = call instanceof Message && (error instanceof GuardDeniedError || error instanceof ValidationError)
    return answered || error instanceof MessageUsageError || error instanceof CooldownError || error instanceof CooldownStoreError || error instanceof UserError
  }
  const interaction = call as Interaction
  if (interaction.isAutocomplete() || !interaction.isRepliable()) return false
  return (
    error instanceof CommandNotFoundError ||
    error instanceof GuardDeniedError ||
    error instanceof CooldownError ||
    error instanceof CooldownStoreError ||
    error instanceof UserError ||
    error instanceof ValidationError
  )
}

