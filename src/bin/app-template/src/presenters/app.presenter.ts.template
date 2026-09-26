import { Service } from 'meocord/decorator'
import { type PresentedError, type ResponseContext, type ResponsePresenter, type ResponseView } from 'meocord/interface'

/** How MeoCord's loading and error views look in this bot, registered with `@MeoCord({ presenter })` */
@Service()
export class AppPresenter implements ResponsePresenter {
  loading({ theme }: ResponseContext): ResponseView {
    return { text: 'Working on it…', emoji: theme.emojis.loading, color: theme.colors.primary }
  }

  // Filters and the fallback choose the words; this only styles them, in the colour of their tone: `warning` when the
  // user can fix it, `danger` for a fault in the bot
  error({ theme }: ResponseContext, { message, tone }: PresentedError): ResponseView {
    return { title: 'Oops!', text: message, color: theme.colors[tone] }
  }
}
