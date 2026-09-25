import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { computeKeyframes, earPath, flickAngles, FLICK_KEYFRAMES, formatMarkJson, MARK, MARK_PATHS } from './mark.js'

// mark.json is the one source for the mark wherever it is drawn; meocord/docs copies it verbatim
describe('mark.json', () => {
  it('holds the keyframes its springs make, which every animated copy plays', () => {
    // A mismatch means the springs changed without the keyframes: run `bun run brand`, which rewrites them
    expect(FLICK_KEYFRAMES).toEqual(computeKeyframes())
    for (const [ms, far, near] of FLICK_KEYFRAMES) expect(flickAngles(ms / 1000)).toEqual({ far, near })
  })

  it('starts and ends the flick still, so the loop has no seam', () => {
    expect(FLICK_KEYFRAMES[0].slice(1)).toEqual([0, 0])
    expect(FLICK_KEYFRAMES.at(-1)!.slice(1)).toEqual([0, 0])
  })

  it('splits the crown at the pivot the ears turn about', () => {
    const [x, y] = MARK.flick.pivot
    expect(MARK_PATHS.crown).toContain(`${x} ${y}`)
    expect(MARK_PATHS.ears.near.crown).toContain(`${x} ${y}`)
    expect(MARK_PATHS.ears.far.crown.startsWith(`M${x} ${y}`)).toBe(true)
    // The two ears' inner cut-outs are the crown's, one each
    expect(MARK_PATHS.ears.near.inner + MARK_PATHS.ears.far.inner).toBe(MARK_PATHS.inner)
    expect(earPath('far', 512)).toBe(MARK_PATHS.ears.far.crown + MARK_PATHS.ears.far.inner)
    expect(earPath('far', 32)).toBe(MARK_PATHS.ears.far.crown)
  })

  it('is kept in the form `bun run brand` writes, so a rewrite changes only what changed', () => {
    const file = readFileSync(path.join(import.meta.dirname, 'mark.json'), 'utf8')
    expect(formatMarkJson(JSON.parse(file))).toBe(file)
  })
})
