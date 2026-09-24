import { type ButtonInteraction } from 'discord.js'
import { GuardDeniedError } from 'meocord/common'
import { Guard } from 'meocord/decorator'
import { type GuardInterface } from 'meocord/interface'

@Guard()
export class OwnerGuard implements GuardInterface {
  canActivate(interaction: ButtonInteraction, { ownerId }: { ownerId: string }): boolean {
    if (interaction.user.id !== ownerId) throw new GuardDeniedError('Only the user who opened this panel can use this button.')
    return true
  }
}
