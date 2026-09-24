import { StringSelectMenuInteraction } from 'discord.js'
import { respond } from 'meocord/common'
import { Command, Controller, Defer } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

@Controller()
export class SampleSelectMenuController {
  // Only the menu used is disabled while this runs
  @Command('select-menu', CommandType.SELECT_MENU)
  @Defer({ disable: 'clicked' })
  async handleSelectMenu(interaction: StringSelectMenuInteraction) {
    await respond(interaction).send({ content: `You picked ${interaction.values.join(', ')}.` })
  }
}
