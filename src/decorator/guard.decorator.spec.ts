/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { Guard, UseGuard } from '@src/decorator/guard.decorator.js'
import { mainContainer } from '@src/decorator/container.js'
import { type GuardInterface } from '@src/interface/index.js'
import { BaseInteraction, Message } from 'discord.js'

afterEach(() => {
  mainContainer.unbindAll()
})

function makeFakeInteraction(): BaseInteraction {
  return Object.create(BaseInteraction.prototype) as BaseInteraction
}

function makeFakeMessage(): Message {
  return Object.create(Message.prototype) as Message
}

describe('@Guard', () => {
  it('binds the guard to the container', () => {
    @Guard()
    class TestGuard implements GuardInterface {
      canActivate() {
        return true
      }
    }

    expect(mainContainer.isBound(TestGuard)).toBe(true)
  })
})

describe('@UseGuard (method decorator)', () => {
  it('allows method execution when guard returns true', async () => {
    @Guard()
    class AllowGuard implements GuardInterface {
      canActivate() {
        return true
      }
    }

    class TestController {
      result = false

      @UseGuard(AllowGuard)
      async handle(_ctx: any) {
        this.result = true
      }
    }

    const ctrl = new TestController()
    await ctrl.handle(makeFakeInteraction())
    expect(ctrl.result).toBe(true)
  })

  it('blocks method execution when guard returns false', async () => {
    @Guard()
    class DenyGuard implements GuardInterface {
      canActivate() {
        return false
      }
    }

    class TestController {
      result = false

      @UseGuard(DenyGuard)
      async handle(_ctx: any) {
        this.result = true
      }
    }

    const ctrl = new TestController()
    await ctrl.handle(makeFakeInteraction())
    expect(ctrl.result).toBe(false)
  })

  it('supports async guards', async () => {
    @Guard()
    class AsyncGuard implements GuardInterface {
      async canActivate() {
        return Promise.resolve(true)
      }
    }

    class TestController {
      result = false

      @UseGuard(AsyncGuard)
      async handle(_ctx: any) {
        this.result = true
      }
    }

    const ctrl = new TestController()
    await ctrl.handle(makeFakeInteraction())
    expect(ctrl.result).toBe(true)
  })

  it('throws when context is not a valid Discord context', async () => {
    @Guard()
    class TestGuard implements GuardInterface {
      canActivate() {
        return true
      }
    }

    class TestController {
      @UseGuard(TestGuard)
      async handle(_ctx: any) {}
    }

    const ctrl = new TestController()
    await expect(ctrl.handle('invalid-context')).rejects.toThrow()
  })

  it('injects params into guard when using GuardWithParams', async () => {
    let receivedLimit: number | undefined

    @Guard()
    class ParamGuard implements GuardInterface {
      limit!: number

      canActivate() {
        receivedLimit = this.limit
        return true
      }
    }

    class TestController {
      @UseGuard({ provide: ParamGuard, params: { limit: 5 } })
      async handle(_ctx: any) {}
    }

    const ctrl = new TestController()
    await ctrl.handle(makeFakeMessage())
    expect(receivedLimit).toBe(5)
  })

  it('runs all guards in order and stops on first denial', async () => {
    const order: string[] = []

    @Guard()
    class FirstGuard implements GuardInterface {
      canActivate() {
        order.push('first')
        return false
      }
    }

    @Guard()
    class SecondGuard implements GuardInterface {
      canActivate() {
        order.push('second')
        return true
      }
    }

    class TestController {
      @UseGuard(FirstGuard, SecondGuard)
      async handle(_ctx: any) {}
    }

    const ctrl = new TestController()
    await ctrl.handle(makeFakeInteraction())
    expect(order).toEqual(['first'])
    expect(order).not.toContain('second')
  })
})
