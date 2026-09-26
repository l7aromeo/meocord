import { SlashCommandBuilder } from 'discord.js'
import { CommandBuilder } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

@CommandBuilder(CommandType.SLASH)
export class ThemeCommandBuilder {
  build(commandName: string) {
    return new SlashCommandBuilder().setName(commandName).setDescription('MeoCord e2e: what respond() and the views take from the theme')
  }
}
