import { UserContextMenuCommandInteraction, MessageContextMenuCommandInteraction } from 'discord.js'
import { Controller, Command, UseGuard } from 'meocord/decorator'
import { SampleCommandBuilder } from '@src/controllers/context-menu/builders/sample.builder'
import { RateLimitGuard } from '@src/guards/rate-limit.guard'

@Controller()
export class SampleContextMenuController {
  @Command('sample-context-menu', SampleCommandBuilder)
  @UseGuard(RateLimitGuard)
  async handleContextMenu(interaction: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction) {
    await interaction.reply('This is sample reply of context menu command.')
  }
}
