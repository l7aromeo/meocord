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

const NO_FLAGS: readonly GivenFlag[] = Object.freeze([])

const isFlagNameChar = (code: number, first: boolean) =>
  (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (!first && ((code >= 48 && code <= 57) || code === 95))

/**
 * A message's flags, `--name` or `--name=value` with the value in quotes when it has spaces, and its text
 * without them, for the words. A word in quotes is never a flag, so `"--bots"` stays text.
 */
export function scanFlags(text: string): { text: string; flags: readonly GivenFlag[] } {
  // Most messages have no flags, and cost this one search
  if (!text.includes('--')) return { text, flags: NO_FLAGS }
  const flags: GivenFlag[] = []
  const kept: string[] = []
  let from = 0
  let i = 0
  while (i < text.length) {
    if (isSpace(text, i)) {
      i++
      continue
    }
    const start = i
    const quoted = quoteEnd(text, i)
    if (quoted !== -1) {
      i = quoted + 1
      continue
    }
    if (text.charCodeAt(i) === 45 && text.charCodeAt(i + 1) === 45 && isFlagNameChar(text.charCodeAt(i + 2), true)) {
      let j = i + 3
      while (j < text.length && isFlagNameChar(text.charCodeAt(j), false)) j++
      if (j === text.length || isSpace(text, j) || text[j] === '=') {
        const name = text.slice(i + 2, j)
        let value: string | undefined
        if (text[j] === '=') {
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
        kept.push(text.slice(from, start))
        from = i = j
        continue
      }
    }
    while (i < text.length && !isSpace(text, i)) i++
  }
  if (flags.length === 0) return { text, flags }
  kept.push(text.slice(from))
  return {
    text: kept
      .map(part => part.trim())
      .filter(Boolean)
      .join(' '),
    flags,
  }
}
