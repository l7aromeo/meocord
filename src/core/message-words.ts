/** A message's words and flags, read in one pass each, shared by matching and by resolving params. */

const QUOTES = new Map([
  ['"', ['"', '”']],
  ['“', ['”', '"']],
])

/** Whether a character is whitespace, as `/\s/` has it, testing the common ASCII cases without a regex. */
export function isSpace(text: string, i: number): boolean {
  const code = text.charCodeAt(i)
  if (code === 32 || (code >= 9 && code <= 13)) return true
  return code > 127 && /\s/.test(text[i])
}

/** A message's words, where text in quotes is one word, each with where it starts in the text. One pass. */
export function splitWords(text: string): { value: string; start: number }[] {
  const words: { value: string; start: number }[] = []
  let i = 0
  while (i < text.length) {
    if (isSpace(text, i)) {
      i++
      continue
    }
    const start = i
    const end = quoteEnd(text, i)
    if (end !== -1) {
      words.push({ value: text.slice(i + 1, end), start })
      i = end + 1
      continue
    }
    while (i < text.length && !isSpace(text, i)) i++
    words.push({ value: text.slice(start, i), start })
  }
  return words
}

/** Where the quote opening at `i` closes, at a closing quote that ends a word; `-1` when none opens or it never closes. */
function quoteEnd(text: string, i: number): number {
  const closers = QUOTES.get(text[i])
  if (!closers) return -1
  let end = i + 1
  while (end < text.length && !(closers.includes(text[end]) && (end + 1 === text.length || isSpace(text, end + 1)))) end++
  // A quote never closed is an ordinary character
  return end < text.length ? end : -1
}

/** A flag as a message gives it: its name, and its value, or `undefined` when given bare. */
export interface GivenFlag {
  name: string
  value: string | undefined
}

const isFlagNameChar = (code: number, first: boolean) =>
  (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (!first && ((code >= 48 && code <= 57) || code === 95))

/** A message's words with its flags left out, the flags, and where each flag sits in the text. */
export interface FlagWords {
  /** The words that are not flags, each with where it starts in the text. */
  words: { value: string; start: number }[]
  flags: GivenFlag[]
  /** Where each flag starts and ends in the text, in pairs, to leave out of a rest. */
  cuts: number[]
}

/**
 * A message's words and flags in one pass: `--name` or `--name=value`, with the value in quotes when it has
 * spaces, is a flag, and a word in quotes never is, so `"--bots"` stays text. Words keep where they start
 * in the text given, so a rest is cut from it with {@link restFrom}.
 */
export function splitFlagWords(text: string): FlagWords {
  const words: { value: string; start: number }[] = []
  const flags: GivenFlag[] = []
  const cuts: number[] = []
  let i = 0
  while (i < text.length) {
    if (isSpace(text, i)) {
      i++
      continue
    }
    const start = i
    const quoted = quoteEnd(text, i)
    if (quoted !== -1) {
      words.push({ value: text.slice(i + 1, quoted), start })
      i = quoted + 1
      continue
    }
    if (text.charCodeAt(i) === 45 && text.charCodeAt(i + 1) === 45 && isFlagNameChar(text.charCodeAt(i + 2), true)) {
      let j = i + 3
      while (j < text.length && isFlagNameChar(text.charCodeAt(j), false)) j++
      if (j === text.length || isSpace(text, j) || text.charCodeAt(j) === 61) {
        const name = text.slice(i + 2, j)
        let value: string | undefined
        if (text.charCodeAt(j) === 61) {
          const end = quoteEnd(text, j + 1)
          if (end !== -1) {
            value = text.slice(j + 2, end)
            j = end + 1
          } else {
            const valueStart = ++j
            while (j < text.length && !isSpace(text, j)) j++
            value = text.slice(valueStart, j)
          }
        }
        flags.push({ name, value })
        cuts.push(start, j)
        i = j
        continue
      }
    }
    while (i < text.length && !isSpace(text, i)) i++
    words.push({ value: text.slice(start, i), start })
  }
  return { words, flags, cuts }
}

/**
 * The text from `start` to the end, as a rest param takes it: without the flags `cuts` marks, the text
 * around each kept as it is and joined by a space.
 */
export function restFrom(text: string, start: number, cuts: readonly number[]): string {
  if (cuts.length === 0 || cuts[cuts.length - 1] <= start) return text.slice(start).trimEnd()
  const parts: string[] = []
  let from = start
  for (let c = 0; c < cuts.length; c += 2) {
    if (cuts[c + 1] <= start) continue
    const part = text.slice(from, cuts[c]).trim()
    if (part) parts.push(part)
    from = cuts[c + 1]
  }
  const last = text.slice(from).trim()
  if (last) parts.push(last)
  return parts.join(' ')
}
