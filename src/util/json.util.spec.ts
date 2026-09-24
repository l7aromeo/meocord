import { parseJsonc, stripJsonc } from '@src/util/json.util.js'

describe('parseJsonc', () => {
  it('reads line and block comments', () => {
    const input = `{
  // the target
  "target": "ESNext", /* inline */
  /* a block
     over lines */
  "strict": true
}`
    expect(parseJsonc(input)).toEqual({ target: 'ESNext', strict: true })
  })

  it('reads trailing commas in objects and arrays, even before a comment', () => {
    expect(parseJsonc(`{ "a": [1, 2, ], "b": { "c": 1, // last\n }, }`)).toEqual({ a: [1, 2], b: { c: 1 } })
  })

  it('keeps URLs, globs and escaped quotes inside strings', () => {
    const input = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "include": ["src/**/*.ts", "a,]"],
  "note": "say \\"hi\\" // not a comment"
}`
    expect(parseJsonc(input)).toEqual({
      $schema: 'https://json.schemastore.org/tsconfig',
      include: ['src/**/*.ts', 'a,]'],
      note: 'say "hi" // not a comment',
    })
  })

  it('leaves strict JSON as it is', () => {
    const input = `{"key":"value","num":42}`
    expect(stripJsonc(input)).toBe(input)
  })

  it('still rejects text that is not JSON once comments are gone', () => {
    expect(() => parseJsonc('{ key: 1 }')).toThrow()
  })
})
