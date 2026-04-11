/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { Guard, UseGuard } from '@src/decorator/guard.decorator.js'
import { MetadataKey } from '@src/enum/index.js'
import { Container } from 'inversify'
import { type GuardInterface } from '@src/interface/index.js'
import { BaseInteraction, Message } from 'discord.js'

function makeFakeInteraction(): BaseInteraction {
  return Object.create(BaseInteraction.prototype) as BaseInteraction
}

function makeFakeMessage(): Message {
  return Object.create(Message.prototype) as Message
}

/** Attach a fresh container (with guards bound) to a controller class. */
function attachContainer(controllerClass: any, ...guardClasses: (new (...args: any[]) => any)[]): Container {
  const container = new Container()
  for (const cls of guardClasses) {
    container.bind(cls).toSelf().inTransientScope()
  }
  Reflect.defineMetadata(MetadataKey.Container, container, controllerClass)
  return container
}

describe('@Guard', () => {
  it('marks the class as inversify-injectable', () => {
    @Guard()
    class TestGuard implements GuardInterface {
      canActivate() {
        return true
      }
    }

    expect(Reflect.getMetadata(MetadataKey.Injectable, TestGuard)).toBe(true)
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

    attachContainer(TestController, AllowGuard)
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

    attachContainer(TestController, DenyGuard)
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

    attachContainer(TestController, AsyncGuard)
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

    attachContainer(TestController, TestGuard)
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

    attachContainer(TestController, ParamGuard)
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

    attachContainer(TestController, FirstGuard, SecondGuard)
    const ctrl = new TestController()
    await ctrl.handle(makeFakeInteraction())
    expect(order).toEqual(['first'])
    expect(order).not.toContain('second')
  })
})
