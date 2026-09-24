import { REPEAT_SIGNAL_WINDOW_MS, stopRequests } from '@src/util/stop-request.util.js'

describe('stopRequests', () => {
  it('counts a request within the window as a copy of the first, and one after it as a repeat', () => {
    let now = 5_000
    const classify = stopRequests(() => now)

    expect(classify()).toBe('first')
    now += REPEAT_SIGNAL_WINDOW_MS - 1
    expect(classify()).toBe('duplicate')
    now += 1
    expect(classify()).toBe('repeat')
    expect(classify()).toBe('repeat')
  })
})
