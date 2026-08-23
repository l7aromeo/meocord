import { MeoCordTestingModule } from 'meocord/testing'
import { SampleService } from '@src/services/sample.service.js'

describe('SampleService', () => {
  let service: SampleService

  beforeEach(() => {
    const module = MeoCordTestingModule.create({
      providers: [{ provide: SampleService, useClass: SampleService }],
    }).compile()
    service = module.get(SampleService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
