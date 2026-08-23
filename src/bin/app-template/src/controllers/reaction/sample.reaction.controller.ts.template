import { MessageReaction } from 'discord.js'
import { Controller, ReactionHandler } from 'meocord/decorator'
import { Logger } from 'meocord/common'
import { ReactionHandlerAction } from 'meocord/enum'
import { type ReactionHandlerOptions } from 'meocord/interface'

@Controller()
export class SampleReactionController {
  private readonly logger = new Logger(SampleReactionController.name)

  @ReactionHandler('😋')
  async handleReaction(reaction: MessageReaction, { user, action }: ReactionHandlerOptions) {
    this.logger.log(`Reaction 😋 ${action === ReactionHandlerAction.ADD ? 'added' : 'removed'}.`)

    if (!reaction.message) return

    if (action === ReactionHandlerAction.ADD) {
      await reaction.message.reply(`${user.username} reacted with 😋!`)
    }
  }

  @ReactionHandler()
  async handleAnyReaction(reaction: MessageReaction, { user, action }: ReactionHandlerOptions) {
    this.logger.log('Reaction detected!')
    if (reaction.message && action === ReactionHandlerAction.ADD) {
      await reaction.message.reply(`${user.username} reacted with ${reaction.emoji.name}!`)
    }
  }
}
