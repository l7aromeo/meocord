import { SlashCommandBuilder } from 'discord.js'
import { CommandBuilder } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

@CommandBuilder(CommandType.SLASH)
export class SampleCommandBuilder {
  build(commandName: string) {
    return new SlashCommandBuilder().setName(commandName).setDescription('This is a sample slash command')
  }
}
