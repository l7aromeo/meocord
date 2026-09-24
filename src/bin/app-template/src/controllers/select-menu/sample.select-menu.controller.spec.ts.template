import { StringSelectMenuInteraction } from 'discord.js'
import { createMockInteraction, createMockMessage, getResponse, MeoCordTestingModule } from 'meocord/testing'
import { SampleSelectMenuController } from '@src/controllers/select-menu/sample.select-menu.controller.js'

describe('SampleSelectMenuController', () => {
  const module = MeoCordTestingModule.create({ controllers: [SampleSelectMenuController] }).compile()

  it('answers with what was picked', async () => {
    const interaction = createMockInteraction(StringSelectMenuInteraction, {
      customId: 'select-menu',
      values: ['one', 'two'],
      message: createMockMessage(),
    })

    await module.invoke(SampleSelectMenuController, 'handleSelectMenu', interaction)

    const answer = getResponse(interaction).calls.at(-1)
    expect(answer?.payload).toMatchObject({ content: 'You picked one, two.' })
  })
})
