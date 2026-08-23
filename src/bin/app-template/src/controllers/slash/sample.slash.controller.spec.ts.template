import { MeoCordTestingModule } from 'meocord/testing'
import { SampleSlashController } from '@src/controllers/slash/sample.slash.controller.js'

describe('SampleSlashController', () => {
  let controller: SampleSlashController

  beforeEach(() => {
    const module = MeoCordTestingModule.create({
      controllers: [SampleSlashController],
    }).compile()
    controller = module.get(SampleSlashController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
