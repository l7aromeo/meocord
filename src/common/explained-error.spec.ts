import { isExplainedError, markExplained } from '@src/common/explained-error.js'

describe('isExplainedError', () => {
  it('recognises an error MeoCord explained, leaving it otherwise as it was', () => {
    const error = new Error('Used disallowed intents')
    expect(isExplainedError(error)).toBe(false)

    markExplained(error)

    expect(isExplainedError(error)).toBe(true)
    expect(Object.keys(error)).toEqual([])
    expect(JSON.stringify({ ...error })).toBe('{}')
    expect(error.message).toBe('Used disallowed intents')
  })

  it('reads false from anything else, and marking a value it cannot mark does nothing', () => {
    const frozen = Object.freeze(new Error('frozen'))
    markExplained(frozen)
    markExplained('text')
    markExplained(null)

    for (const value of [frozen, 'text', null, undefined, 42, {}]) expect(isExplainedError(value)).toBe(false)
  })
})
