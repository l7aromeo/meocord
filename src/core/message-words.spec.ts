import { scanFlags, splitWords } from '@src/core/message-words.js'

describe('scanFlags', () => {
  it('takes out --name and --name=value, keeping the text between them', () => {
    expect(scanFlags('purge 50 --bots --from=<@1> now')).toEqual({
      text: 'purge 50 now',
      flags: [
        { name: 'bots', value: undefined },
        { name: 'from', value: '<@1>' },
      ],
    })
  })

  it('reads a value in straight or curly quotes as one, and an empty value as empty', () => {
    expect(scanFlags('remind --note="buy milk" 10m --tag=“two words” --x=').flags).toEqual([
      { name: 'note', value: 'buy milk' },
      { name: 'tag', value: 'two words' },
      { name: 'x', value: '' },
    ])
    expect(scanFlags('--note="never closed').flags).toEqual([{ name: 'note', value: '"never' }])
  })

  it('reads as text what is not a flag: quoted words, a bare --, a name not starting with a letter, and punctuation after a name', () => {
    for (const text of ['"--bots" here', '-- dash', '---x', '--9lives', '--bots!', '-x', 'a--b']) {
      expect(scanFlags(text)).toEqual({ text, flags: [] })
    }
  })

  it('returns the text untouched when it has no flags, and trims around the flags it takes out', () => {
    const text = 'say   "spaced  out"  words'
    expect(scanFlags(text).text).toBe(text)
    expect(scanFlags('--a  one   two  --b').text).toBe('one   two')
    expect(splitWords(scanFlags('"a b" --c "d e"').text).map(word => word.value)).toEqual(['a b', 'd e'])
  })
})
