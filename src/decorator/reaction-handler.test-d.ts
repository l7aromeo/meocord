import { describe, it } from 'vitest'
import { type MessageReaction } from 'discord.js'
import { ReactionHandler } from '@src/decorator/index.js'
import { type ReactionHandlerOptions } from '@src/interface/index.js'

/** Runs under `vitest --typecheck`: what `@ReactionHandler` accepts. */

describe('@ReactionHandler settings', () => {
  it('takes an emoji, settings, or both', () => {
    class Reactions {
      @ReactionHandler()
      async any(_reaction: MessageReaction, _options: ReactionHandlerOptions) {
        return undefined
      }

      @ReactionHandler('👍')
      async thumbs(_reaction: MessageReaction) {
        return undefined
      }

      @ReactionHandler('📌', { bots: true })
      async pin(_reaction: MessageReaction, _options: ReactionHandlerOptions) {
        return undefined
      }

      @ReactionHandler({ bots: true })
      async relay() {
        return undefined
      }

      // @ts-expect-error bots is a boolean
      @ReactionHandler('👍', { bots: 'yes' })
      async wrong() {
        return undefined
      }

      // @ts-expect-error the setting is `bots`
      @ReactionHandler({ bot: true })
      async misspelt() {
        return undefined
      }
    }
    void Reactions
  })
})
