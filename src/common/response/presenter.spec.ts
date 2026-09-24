import { ChatInputCommandInteraction, ComponentType, resolveColor } from 'discord.js'
import { Command, Controller, MeoCord, Service } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { type PresentedError, type ResponsePresenter } from '@src/interface/index.js'
import { Theme } from '@src/common/theme.js'
import { defaultPresenter, renderContainer, renderEmbed, RENDERED_CONTAINER_ID } from '@src/common/response/presenter.js'
import { respond } from '@src/common/response/response-state.js'
import { createMockInteraction, MeoCordTestingModule } from '@src/testing/index.js'

describe('the default presenter', () => {
  const context = { interaction: createMockInteraction(ChatInputCommandInteraction), locale: 'en-US', mode: 'embed' as const }

  it('loads with "⏳ Working on it…" in the primary colour', () => {
    expect(renderEmbed(defaultPresenter.loading(context))).toEqual({
      description: '⏳ Working on it…',
      color: resolveColor(Theme.primaryColor),
    })
  })

  it('shows errors as MeoCord always has: "Oops!" in the error colour', () => {
    expect(renderEmbed(defaultPresenter.error(context, { message: 'Nope.', error: new Error() }))).toEqual({
      title: 'Oops!',
      description: 'Nope.',
      color: resolveColor(Theme.errorColor),
    })
  })

  it('renders a Components V2 container with the heading, text and extra components', () => {
    const container = renderContainer({
      title: 'Oops!',
      text: 'Nope.',
      color: Theme.errorColor,
      components: [{ type: ComponentType.Separator }],
    })

    expect(container).toMatchObject({
      type: ComponentType.Container,
      id: RENDERED_CONTAINER_ID,
      accent_color: resolveColor(Theme.errorColor),
      components: [{ type: ComponentType.TextDisplay, content: '### Oops!\nNope.' }, { type: ComponentType.Separator }],
    })
  })
})

@Service()
class Branding {
  readonly name = 'Brand'
}

@Service()
class BrandPresenter implements ResponsePresenter {
  constructor(private readonly branding: Branding) {}

  loading() {
    return { text: `${this.branding.name} is working…` }
  }

  error(_context: unknown, { message }: PresentedError) {
    return { title: this.branding.name, text: message }
  }
}

@Controller()
class FailingController {
  @Command('fail', CommandType.SLASH)
  async fail(interaction: ChatInputCommandInteraction) {
    await respond(interaction).error(new Error('x'), { message: 'Broken.' })
  }
}

@MeoCord({ controllers: [FailingController], clientOptions: { intents: [] }, presenter: BrandPresenter })
class App {}

describe('@MeoCord({ presenter })', () => {
  it('styles respond() answers with the app presenter, resolved with its dependencies', async () => {
    const module = MeoCordTestingModule.create({ app: App, controllers: [FailingController] }).compile()
    const interaction = createMockInteraction(ChatInputCommandInteraction)

    await module.invoke(FailingController, 'fail', interaction)

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [{ title: 'Brand', description: 'Broken.' }] }),
    )
  })
})
