import { ChatInputCommandInteraction } from 'discord.js'
import { respond } from 'meocord/common'
import { Command, Controller, Cooldown, Defer } from 'meocord/decorator'
import { SampleCommandBuilder } from '@src/controllers/slash/builders/sample.builder'

@Controller()
export class SampleSlashController {
  @Command('sample-slash', SampleCommandBuilder)
  @Cooldown({ uses: 5, seconds: 60 })
  async handleSampleSlash(interaction: ChatInputCommandInteraction) {
    await respond(interaction).send('This is sample reply of slash command.')
  }

  // Deferred before anything else runs, so slow work here never misses Discord's three seconds
  @Command('sample-slash-2', SampleCommandBuilder)
  @Cooldown({ uses: 5, seconds: 60 })
  @Defer({ ephemeral: true })
  async handleSampleSlashTwo(interaction: ChatInputCommandInteraction) {
    await respond(interaction).send('This is a private reply, sent after a deferred start.')
  }
}
