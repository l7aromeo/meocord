import { matchesEmoji } from '@src/decorator/controller.decorator.js'

describe('matchesEmoji', () => {
  const party = { id: '111', name: 'party' }

  it.each([
    ['👍', { id: null, name: '👍' }, true],
    ['👍', { id: null, name: '🔥' }, false],
    ['party', party, true],
    ['party', { id: '222', name: 'party' }, true],
    ['111', party, true],
    ['111', { id: '222', name: 'party' }, false],
    ['<:party:111>', party, true],
    ['<a:party:111>', party, true],
    // By id only: another server's emoji of the same name is not this one
    ['<:party:111>', { id: '222', name: 'party' }, false],
    ['<:party:111>', { id: null, name: 'party' }, false],
  ] as const)('%s matches %j: %s', (declared, emoji, expected) => {
    expect(matchesEmoji(declared, emoji)).toBe(expected)
  })
})
