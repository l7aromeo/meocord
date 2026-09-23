import 'reflect-metadata'
import { vi } from 'vitest'
import { MeoCordTestingModule } from './meocord-testing-module.js'

// A double covers only the methods under test, and a class with a private member cannot be an
// object literal. Types are checked in meocord-testing-module.test-d.ts; `providers` only at runtime.
describe('providers', () => {
  class NotificationService {
    private readonly prefix = '[bot] '

    async notify(message: string): Promise<string> {
      return this.prefix + message
    }

    async broadcast(message: string): Promise<string> {
      return this.prefix + message
    }
  }

  it('accepts a double covering only the methods under test, without a cast', () => {
    const notify = vi.fn()

    const module = MeoCordTestingModule.create({
      providers: [{ provide: NotificationService, useValue: { notify } }],
    }).compile()

    expect(module.get(NotificationService).notify).toBe(notify)
  })

  it('accepts the same shape through overrideProvider', () => {
    const notify = vi.fn()

    const module = MeoCordTestingModule.create({
      providers: [{ provide: NotificationService, useValue: new NotificationService() }],
    })
      .overrideProvider(NotificationService)
      .useValue({ notify })
      .compile()

    expect(module.get(NotificationService).notify).toBe(notify)
  })
})
