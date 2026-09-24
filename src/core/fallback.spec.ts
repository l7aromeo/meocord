import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  type APIEmbed,
  Message,
  MessageFlagsBitField,
  ModalSubmitInteraction,
  resolveColor,
} from 'discord.js'
import { vi } from 'vitest'
import {
  CommandNotFoundError,
  CooldownError,
  cooldownMessage,
  GuardDeniedError,
  Theme,
  ValidationError,
} from '@src/common/index.js'
import { Logger } from '@src/common/logger.js'
import { UnroutedExecutionContext } from '@src/common/execution-context.js'
import { createFallback } from '@src/core/fallback.js'
import { createMockInteraction, createMockMessage } from '@src/testing/index.js'

const createLogger = () =>
  ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn() }) as unknown as Logger & {
    error: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    debug: ReturnType<typeof vi.fn>
  }

const failure = new Error('boom')
const GENERIC = 'An error occurred while executing the command.'
const Ephemeral = MessageFlagsBitField.Flags.Ephemeral

function discordError(code: number) {
  return Object.assign(new Error(`Discord error ${code}`), { code })
}

interface Sent {
  embeds?: APIEmbed[]
  flags?: unknown
}

/** What the first call to a reply method sent. */
function sent(method: { mock: { calls: unknown[][] } }): Sent {
  return method.mock.calls[0][0] as Sent
}

/** The description of the one embed a payload carries, checking it is styled as an error. */
function describedAs(payload: Sent): string | undefined {
  const [embed] = payload.embeds ?? []
  expect(embed.color).toBe(resolveColor(Theme.errorColor))
  expect(embed.title).toBe('Oops!')
  return embed.description
}

async function fail(interaction: unknown, error: unknown = failure, logger = createLogger()) {
  await createFallback(logger)(error, new UnroutedExecutionContext([interaction]))
  return logger
}

describe('the fallback', () => {
  // A message sent too often is simply ignored, as the cooldown means; it is not a fault to report.
  it('logs a message blocked by a cooldown at debug level only', async () => {
    const logger = await fail(createMockMessage(), new CooldownError(5_000, 'channel'))

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Cooldown (channel)'))
  })

  it('still logs any other error from a message as an error', async () => {
    const logger = await fail(createMockMessage())

    expect(logger.error).toHaveBeenCalled()
  })

  describe('on an unanswered interaction', () => {
    it('replies privately with the 4.0 text and error styling', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)

      const logger = await fail(interaction)

      const payload = sent(interaction.reply)
      expect(describedAs(payload)).toBe(GENERIC)
      expect(payload.flags).toBe(Ephemeral)
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error handling'), failure)
    })

    it('says "Command not found!" for CommandNotFoundError, as a warning', async () => {
      const interaction = createMockInteraction(ButtonInteraction)

      const logger = await fail(interaction, new CommandNotFoundError('No handler matched it.'))

      expect(describedAs(sent(interaction.reply))).toBe('Command not found!')
      expect(logger.warn).toHaveBeenCalledWith('No handler matched it.')
      expect(logger.error).not.toHaveBeenCalled()
    })

    it("shows a GuardDeniedError's own message, privately", async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)

      const logger = await fail(interaction, new GuardDeniedError('Owners only.'))

      const payload = sent(interaction.reply)
      expect(describedAs(payload)).toBe('Owners only.')
      expect(payload.flags).toBe(Ephemeral)
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('tells a caller blocked by a cooldown privately how long to wait, logging it only at debug level', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)

      const logger = await fail(interaction, new CooldownError(12_000, 'user'))

      const payload = sent(interaction.reply)
      expect(describedAs(payload)).toBe('Slow down: try again in 12s.')
      expect(payload.flags).toBe(Ephemeral)
      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Cooldown (user)'))
    })

    it("lists a ValidationError's issues privately, logging it only at debug level", async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      const invalid = new ValidationError([
        { message: 'Must be at least 1', path: ['minutes'] },
        { message: 'Too long', path: ['note'] },
      ])

      const logger = await fail(interaction, invalid)

      const payload = sent(interaction.reply)
      expect(describedAs(payload)).toBe('minutes: Must be at least 1\nnote: Too long')
      expect(payload.flags).toBe(Ephemeral)
      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Invalid input'))
    })
  })

  describe('on a command whose reply was deferred', () => {
    it('edits the deferred reply into the error', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      await interaction.deferReply()

      await fail(interaction)

      expect(describedAs(sent(interaction.editReply))).toBe(GENERIC)
      expect(interaction.followUp).not.toHaveBeenCalled()
    })

    it('keeps validation issues private on a public deferred command', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      await interaction.deferReply()

      await fail(interaction, new ValidationError([{ message: 'Must be at least 1', path: ['minutes'] }]))

      expect(interaction.editReply).not.toHaveBeenCalled()
      expect(interaction.deleteReply).toHaveBeenCalled()
      expect(sent(interaction.followUp).flags).toBe(Ephemeral)
    })

    it('deletes the deferred reply, then follows up privately, for an error about the caller', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      await interaction.deferReply()
      const steps: string[] = []
      interaction.deleteReply.mockImplementation(async () => void steps.push('delete'))
      interaction.followUp.mockImplementation(async () => {
        steps.push('followUp')
        return createMockMessage() as unknown as Message
      })

      await fail(interaction, new GuardDeniedError('Owners only.'))

      expect(interaction.editReply).not.toHaveBeenCalled()
      expect(steps).toEqual(['delete', 'followUp'])
      const payload = sent(interaction.followUp)
      expect(describedAs(payload)).toBe('Owners only.')
      expect(payload.flags).toBe(Ephemeral)
    })

    it('keeps a CooldownError private on a public deferred command, with cooldownMessage()', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      await interaction.deferReply()

      await fail(interaction, new CooldownError(12_000, 'user'))

      expect(interaction.editReply).not.toHaveBeenCalled()
      expect(interaction.deleteReply).toHaveBeenCalledTimes(1)
      const payload = sent(interaction.followUp)
      expect(describedAs(payload)).toBe(cooldownMessage(12_000))
      expect(payload.flags).toBe(Ephemeral)
    })

    it('treats a modal submitted from a command like a command', async () => {
      const interaction = createMockInteraction(ModalSubmitInteraction)
      await interaction.deferReply()

      await fail(interaction)

      expect(interaction.editReply).toHaveBeenCalled()
    })
  })

  describe('on an interaction already answered', () => {
    it('follows up privately after a reply', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      await interaction.reply({ content: 'working on it' })

      await fail(interaction)

      const payload = sent(interaction.followUp)
      expect(describedAs(payload)).toBe(GENERIC)
      expect(payload.flags).toBe(Ephemeral)
    })

    it('never edits the message of a deferred component, following up privately instead', async () => {
      const interaction = createMockInteraction(ButtonInteraction)
      await interaction.deferUpdate()

      await fail(interaction)

      expect(interaction.editReply).not.toHaveBeenCalled()
      expect(interaction.deleteReply).not.toHaveBeenCalled()
      expect(sent(interaction.followUp).flags).toBe(Ephemeral)
    })

    it('never edits the message a deferred modal was submitted from', async () => {
      const interaction = createMockInteraction(ModalSubmitInteraction, {
        message: createMockMessage() as unknown as Message,
      })
      interaction.deferred = true

      await fail(interaction)

      expect(interaction.editReply).not.toHaveBeenCalled()
      expect(interaction.followUp).toHaveBeenCalled()
    })
  })

  describe('when delivery fails', () => {
    it('follows up once after 40060, the interaction having been answered elsewhere', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      interaction.reply.mockRejectedValueOnce(discordError(40060))
      interaction.followUp.mockResolvedValue(undefined as never)

      await fail(interaction)

      expect(interaction.followUp).toHaveBeenCalledTimes(1)
    })

    it('logs any other failure at debug level and never throws', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      interaction.reply.mockRejectedValueOnce(discordError(50001))

      const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)

      await fail(interaction)

      expect(interaction.followUp).not.toHaveBeenCalled()
      expect(debug).toHaveBeenCalledWith(expect.stringContaining('Could not deliver the error reply'))
      debug.mockRestore()
    })

    it('never throws when the 40060 retry fails too', async () => {
      const interaction = createMockInteraction(ChatInputCommandInteraction)
      interaction.reply.mockRejectedValueOnce(discordError(40060))
      interaction.followUp.mockRejectedValueOnce(discordError(10062))

      await expect(fail(interaction)).resolves.toBeDefined()
    })
  })

  it('only logs an expired interaction (10062)', async () => {
    const interaction = createMockInteraction(ChatInputCommandInteraction)

    const logger = await fail(interaction, discordError(10062))

    expect(interaction.reply).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('expired'), expect.anything())
  })

  it('closes an autocomplete menu with an empty list', async () => {
    const interaction = createMockInteraction(AutocompleteInteraction)

    await fail(interaction)

    expect(interaction.respond).toHaveBeenCalledWith([])
  })

  it('only logs an error from a message handler', async () => {
    const message = createMockMessage()
    Object.assign(message, { content: 'hello' })

    const logger = await fail(message)

    expect(logger.error).toHaveBeenCalledWith('Error handling message "hello":', failure)
    expect(message.reply).not.toHaveBeenCalled()
  })
})
