import { MeoCordTestingModule } from 'meocord/testing'
import { SampleButtonController } from '@src/controllers/button/sample.button.controller.js'

describe('SampleButtonController', () => {
  let controller: SampleButtonController

  beforeEach(() => {
    const module = MeoCordTestingModule.create({
      controllers: [SampleButtonController],
    }).compile()
    controller = module.get(SampleButtonController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
