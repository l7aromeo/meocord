/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { Theme } from '@src/common/theme.js'

describe('Theme', () => {
  it('has the correct success color', () => {
    expect(Theme.successColor).toBe('#28A745')
  })

  it('has the correct info color', () => {
    expect(Theme.infoColor).toBe('#17A2B8')
  })

  it('has the correct error color', () => {
    expect(Theme.errorColor).toBe('#DC3545')
  })

  it('has the correct warning color', () => {
    expect(Theme.warningColor).toBe('#FFC107')
  })

  it('exposes all four color properties', () => {
    expect(Theme).toHaveProperty('successColor')
    expect(Theme).toHaveProperty('infoColor')
    expect(Theme).toHaveProperty('errorColor')
    expect(Theme).toHaveProperty('warningColor')
  })
})
