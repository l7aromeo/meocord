import { MeoCordTestingModule } from 'meocord/testing'
import { SampleMessageController } from '@src/controllers/message/sample.message.controller.js'

describe('SampleMessageController', () => {
  let controller: SampleMessageController

  beforeEach(() => {
    const module = MeoCordTestingModule.create({
      controllers: [SampleMessageController],
    }).compile()
    controller = module.get(SampleMessageController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
