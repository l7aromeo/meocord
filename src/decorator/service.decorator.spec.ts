/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { Service } from '@src/decorator/service.decorator.js'
import { mainContainer } from '@src/decorator/container.js'

afterEach(() => {
  mainContainer.unbindAll()
})

describe('@Service', () => {
  it('binds the class to the container', () => {
    @Service()
    class TestService {}

    expect(mainContainer.isBound(TestService)).toBe(true)
  })

  it('resolves to the same singleton instance on repeated gets', () => {
    @Service()
    class CounterService {
      value = Math.random()
    }

    const a = mainContainer.get(CounterService)
    const b = mainContainer.get(CounterService)
    expect(a).toBe(b)
  })

  it('does not throw when the class is already bound', () => {
    @Service()
    class TestService {}

    // Applying the decorator a second time — already bound, should not rebind
    expect(() => Service()(TestService)).not.toThrow()
  })

  it('recursively binds declared dependencies', () => {
    @Service()
    class DepService {}

    @Service()
    class ParentService {
      constructor(public dep: DepService) {}
    }

    expect(mainContainer.isBound(DepService)).toBe(true)
    expect(mainContainer.isBound(ParentService)).toBe(true)
  })

  it('resolves a service instance from the container', () => {
    @Service()
    class GreetService {
      greet() {
        return 'hello'
      }
    }

    const instance = mainContainer.get(GreetService)
    expect(instance).toBeInstanceOf(GreetService)
    expect(instance.greet()).toBe('hello')
  })
})
