import { type Message, resolveColor } from 'discord.js'
import { useTheme, UserError } from 'meocord/common'
import { Controller, On, UseTheme } from 'meocord/decorator'
import { CLASS_THEME, COLOR_ROLES, EMOJI_ROLES, REFUSAL, REFUSE, SWATCHES } from '@src/theme-showcase'
import { report } from '@src/report'

/**
 * What the helper bot drives to check themes on real ids. A gateway event reaches a listener for a bot's message,
 * where a message handler would ignore it, and the listener's call is themed as a handler's is.
 */
@Controller()
@UseTheme(CLASS_THEME)
export class ThemeShowcaseController {
  @On('messageCreate')
  async showcase(message: Message) {
    if (message.content === REFUSE) throw new UserError(REFUSAL)
    if (message.content !== SWATCHES) return
    const { colors, emojis } = useTheme()
    const reply = await message.reply({
      content: EMOJI_ROLES.map(role => `${role} ${emojis[role]}`).join('\n'),
      embeds: COLOR_ROLES.map(role => ({ title: role, color: resolveColor(colors[role] as Parameters<typeof resolveColor>[0]) })),
      allowedMentions: { repliedUser: false },
    })
    report('theme-reply', { id: reply.id, to: message.id })
  }
}
