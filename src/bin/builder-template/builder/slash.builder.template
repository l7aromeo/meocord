import { SlashCommandBuilder } from 'discord.js'
import { CommandBuilder } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

@CommandBuilder(CommandType.SLASH)
export class SampleCommandBuilder {
  build() {
    return new SlashCommandBuilder().setName('sample-slash').setDescription('This is a sample slash command')
  }
}
