import { ChatInputCommandInteraction } from 'discord.js'
import { createMockInteraction, createMockTheme } from 'meocord/testing'
import { AppPresenter } from '@src/presenters/app.presenter.js'

describe('AppPresenter', () => {
  const presenter = new AppPresenter()
  const theme = createMockTheme({ colors: { primary: '#123456', warning: '#654321', danger: '#ABCDEF' } })
  const context = {
    interaction: createMockInteraction(ChatInputCommandInteraction),
    locale: 'en-US',
    mode: 'embed' as const,
    theme,
  }

  it("shows a loading view in the theme's primary colour, with its loading emoji", () => {
    expect(presenter.loading(context)).toMatchObject({ emoji: theme.emojis.loading, color: '#123456' })
  })

  it('styles an error with the words it is given, in the colour of its tone', () => {
    const error = new Error('x')

    expect(presenter.error(context, { message: 'Try again later.', error, tone: 'danger' })).toMatchObject({
      text: 'Try again later.',
      color: '#ABCDEF',
    })
    expect(presenter.error(context, { message: 'Pick a smaller number.', error, tone: 'warning' })).toMatchObject({
      color: '#654321',
    })
  })
})
