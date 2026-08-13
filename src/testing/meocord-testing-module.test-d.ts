/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from 'vitest'
import { MeoCordTestingModule } from './meocord-testing-module.js'

/**
 * Runs under `vitest --typecheck`. The negative case uses `@ts-expect-error`,
 * which fails once the rejected form starts compiling.
 */

class NotificationService {
  private readonly prefix = '[bot] '

  async notify(message: string): Promise<string> {
    return this.prefix + message
  }

  async broadcast(message: string): Promise<string> {
    return this.prefix + message
  }
}

describe('overrideProvider', () => {
  // Asserted by calling it, not by inspecting the parameter type: `T` extends
  // `Partial<T>`, so `.parameter(0).toExtend<Partial<T>>()` holds under both
  // signatures and proves nothing. Passing a genuine partial is what fails when
  // the parameter tightens back to `T`.
  it('accepts a double covering only the methods under test', () => {
    MeoCordTestingModule.create({})
      .overrideProvider(NotificationService)
      .useValue({ notify: async () => 'ok' })
  })

  // Cannot distinguish `Partial<T>` from `T` — both reject it — but it does
  // catch a loosening to `Record<string, unknown>` or `any`.
  it('rejects a misspelled method name', () => {
    MeoCordTestingModule.create({})
      .overrideProvider(NotificationService)
      // @ts-expect-error `notifi` is not a method on NotificationService.
      .useValue({ notifi: () => Promise.resolve('') })
  })
})
