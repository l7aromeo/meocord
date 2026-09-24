import { vi } from 'vitest'

// The toThrow guard in vitest.setup.ts: a message or pattern needs an error to match against.

const throwing = (value: unknown) => () => {
  throw value
}

describe('toThrow and toThrowError with a message or pattern', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('fail when %s is thrown', (_label, value) => {
    expect(() => expect(throwing(value)).toThrow('boom')).toThrow('expected an error matching boom')
    expect(() => expect(throwing(value)).toThrow(/boom/)).toThrow('expected an error matching /boom/')
    expect(() => expect(throwing(value)).toThrowError('boom')).toThrow('expected an error matching boom')
    expect(() => expect(throwing(value)).toThrow(new Error('boom'))).toThrow('expected an error matching Error: boom')
  })

  it('fail when a promise rejects with undefined', async () => {
    await expect(expect(Promise.reject(undefined)).rejects.toThrow('boom')).rejects.toThrow('expected an error matching boom')
  })

  it('still pass and fail on real errors as before', async () => {
    expect(throwing(new Error('boom now'))).toThrow('boom')
    expect(throwing(new Error('boom now'))).toThrow(/boom/)
    expect(throwing(new Error('boom now'))).toThrowError('boom')
    expect(() => expect(throwing(new Error('other'))).toThrow('boom')).toThrow()
    await expect(Promise.reject(new Error('boom now'))).rejects.toThrow('boom')
  })

  it('call the function once', () => {
    const fn = vi.fn(throwing(new Error('boom')))
    expect(fn).toThrow('boom')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('the forms without a message', () => {
  it('are unchanged', () => {
    expect(throwing(undefined)).toThrow()
    expect(throwing(new TypeError('x'))).toThrow(TypeError)
    expect(() => expect(throwing(undefined)).toThrow(Error)).toThrow()
    expect(() => 1).not.toThrow()
    expect(() => 1).not.toThrow('boom')
    expect(throwing(new Error('other'))).not.toThrow('boom')
  })
})
