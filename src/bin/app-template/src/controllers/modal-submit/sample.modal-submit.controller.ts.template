import { ModalSubmitInteraction } from 'discord.js'
import { respond } from 'meocord/common'
import { Command, Controller, Cooldown, Defer } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

@Controller()
export class SampleModalSubmitController {
  @Command('submit-modal', CommandType.MODAL_SUBMIT)
  @Cooldown({ uses: 5, seconds: 60 })
  @Defer({ ephemeral: true })
  async handleModal(interaction: ModalSubmitInteraction) {
    await respond(interaction).send('Modal submitted!')
  }
}
