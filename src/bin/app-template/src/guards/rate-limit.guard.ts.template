import { Guard } from 'meocord/decorator'
import { type GuardInterface } from 'meocord/interface'
import { BaseInteraction } from 'discord.js'
import { Logger } from 'meocord/common'

class RateLimiterGuardOptions {
  limit?: number
  windowInSeconds?: number
}

@Guard()
export class RateLimitGuard implements GuardInterface {
  // ==============================
  // NOTE: Consider using Redis or another distributed store for rate limits in production
  // ==============================
  private logger = new Logger(RateLimitGuard.name)

  private rateLimits = new Map<string, number[]>()
  private readonly limit: number
  private readonly windowInSeconds: number

  constructor(options: RateLimiterGuardOptions = {}) {
    this.limit = options.limit || 5
    this.windowInSeconds = options.windowInSeconds || 60
  }

  async canActivate(interaction: BaseInteraction): Promise<boolean> {
    const userId = interaction.user.id

    let key: string
    if (interaction.isChatInputCommand()) {
      const commandId = interaction.commandName
      const subCommand = interaction.options.getSubcommand(false) || ''
      key = subCommand ? `${commandId}:${subCommand}:${userId}` : `${commandId}:${userId}`
    } else if (interaction.isMessageComponent()) {
      key = `${interaction.customId}:${userId}`
    } else {
      key = userId
    }

    const currentTime = Math.floor(Date.now() / 1000)
    const timestamps = this.rateLimits.get(key) || []

    const filteredTimestamps = timestamps.filter(time => currentTime - time < this.windowInSeconds)
    filteredTimestamps.push(currentTime)
    this.rateLimits.set(key, filteredTimestamps)

    this.logger.debug(key, filteredTimestamps.length, this.limit, this.windowInSeconds)

    return filteredTimestamps.length <= this.limit
  }
}
