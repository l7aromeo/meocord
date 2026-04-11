/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { fixJSON } from '@src/util/json.util.js'

describe('fixJSON', () => {
  it('removes single-line comments', () => {
    const input = `{
  "key": "value" // comment
}`
    const result = fixJSON(input)
    expect(result).not.toContain('//')
    expect(JSON.parse(result)).toEqual({ key: 'value' })
  })

  it('removes trailing commas before }', () => {
    const input = `{
  "key": "value",
}`
    expect(JSON.parse(fixJSON(input))).toEqual({ key: 'value' })
  })

  it('removes trailing commas before ]', () => {
    const input = `{"arr": [1, 2, 3,]}`
    expect(JSON.parse(fixJSON(input))).toEqual({ arr: [1, 2, 3] })
  })

  it('removes trailing commas at end of string', () => {
    const input = `{"key": "value",`
    const result = fixJSON(input)
    expect(result.trimEnd()).not.toMatch(/,$/)
  })

  it('handles multiple issues at once', () => {
    const input = `{
  "a": 1, // comment
  "b": [1, 2,],
  "c": "x",
}`
    const parsed = JSON.parse(fixJSON(input))
    expect(parsed).toEqual({ a: 1, b: [1, 2], c: 'x' })
  })

  it('leaves valid JSON unchanged', () => {
    const input = `{"key":"value","num":42}`
    expect(JSON.parse(fixJSON(input))).toEqual({ key: 'value', num: 42 })
  })

  it('removes empty lines', () => {
    const input = `{

  "key": "value"

}`
    const result = fixJSON(input)
    expect(result).not.toMatch(/^\s*$/m)
  })
})
