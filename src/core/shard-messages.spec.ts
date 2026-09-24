import { isShardMessage } from '@src/core/shard-messages.js'

describe('isShardMessage', () => {
  // discord.js sends its own IPC messages over the same channel
  it.each([null, undefined, 'shutdown', 42, {}, { _ready: true }, { _eval: 'code' }])('ignores %j', message => {
    expect(isShardMessage(message)).toBe(false)
  })

  it('recognises a message carrying meocord', () => {
    expect(isShardMessage({ meocord: 'shutdown' })).toBe(true)
    expect(isShardMessage({ meocord: 'fatal', code: 'TokenInvalid', message: 'x' })).toBe(true)
  })
})
