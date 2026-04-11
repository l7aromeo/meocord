/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { Service } from '@src/decorator/service.decorator.js'
import { MetadataKey } from '@src/enum/index.js'

describe('@Service', () => {
  it('marks the class as inversify-injectable', () => {
    @Service()
    class TestService {}

    expect(Reflect.getMetadata(MetadataKey.Injectable, TestService)).toBe(true)
  })

  it('does not throw when applied to an already-injectable class', () => {
    @Service()
    class TestService {}

    expect(() => Service()(TestService as any)).not.toThrow()
  })
})
