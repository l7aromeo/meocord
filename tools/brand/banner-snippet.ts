// The code the README banner shows, between the region markers. It typechecks with the repository,
// so the banner cannot show an API that does not exist.
import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import { respond } from '@src/common/index.js'
import { Command, CommandBuilder, Controller, Cooldown, Guard, UseGuard } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'

@CommandBuilder(CommandType.SLASH)
class GreetBuilder {
  build(name: string) {
    return new SlashCommandBuilder().setName(name).setDescription('Say hello')
  }
}

@Guard()
class MemberGuard {
  canActivate(interaction: ChatInputCommandInteraction) {
    return interaction.inCachedGuild()
  }
}

@Controller()
export class GreetController {
  // #region banner
  @Command('greet', GreetBuilder)
  @UseGuard(MemberGuard)
  @Cooldown({ uses: 3, seconds: 10 })
  async greet(interaction: ChatInputCommandInteraction) {
    await respond(interaction).send({ content: 'Hello, Ada!' })
  }
  // #endregion banner
}
