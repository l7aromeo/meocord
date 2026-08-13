/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { vi } from 'vitest'
import { MeoCordTestingModule } from './meocord-testing-module.js'

// A test double covers the methods under test, never the whole class, and a
// class with any private member — every service that holds a logger — can never
// be satisfied by an object literal at all. The compile-time half of this
// contract lives in meocord-testing-module.test-d.ts; the `providers` array is
// only checked at runtime, since `Provider[]` erases its type parameter.
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
