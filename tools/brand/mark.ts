/**
 * The mark: a cat's two ears peeking over the cord, drawn on a 16-unit grid. Everything about it is read
 * from mark.json, the one source meocord/docs copies verbatim and checks against.
 */
import mark from './mark.json' with { type: 'json' }

export const MARK = mark

export const MARK_VIEWBOX = mark.viewBox as [number, number, number, number]

/** The smallest size, in device pixels, that draws the inner ears. */
export const NOTCH_MIN_SIZE = mark.notchMinSize

export const MARK_PATHS = mark.paths

/** The ears' path for a size in device pixels: notched from NOTCH_MIN_SIZE up, the plain crown below. */
export function earsPath(size: number): string {
  return size >= NOTCH_MIN_SIZE ? MARK_PATHS.crown + MARK_PATHS.inner : MARK_PATHS.crown
}

/** One ear's path, split from the crown at the valley, notched from NOTCH_MIN_SIZE up. */
export function earPath(ear: 'near' | 'far', size: number): string {
  const { crown, inner } = MARK_PATHS.ears[ear]
  return size >= NOTCH_MIN_SIZE ? crown + inner : crown
}

/** Tile corner radius, in grid units. */
export const MARK_TILE_RADIUS = mark.tileRadius

/** Where the valley between the ears sits, in grid units: the far ear tips about it. */
export const EAR_VALLEY_X = mark.flick.pivot[0]

export interface MarkColours {
  tile: string
  ink: string
  accent: string
}

/** The graphite tile the logo and app icons use. */
export const MARK_DARK: MarkColours = mark.colours.dark

/** The accent-tint tile the avatar uses. */
export const MARK_TINT: MarkColours = mark.colours.tint

type Spring = (typeof mark.flick.springs)['far']

/** One ear's angle, in degrees clockwise, `seconds` into the flick: a damped spring after its delay. */
function springAngle({ amplitude, decay, period, delayMs }: Spring, seconds: number): number {
  const t = seconds - delayMs / 1000
  const angle = t <= 0 ? 0 : amplitude * Math.exp(-t / decay) * Math.sin((2 * Math.PI * t) / period)
  // Rounded, so the settled frames are exactly still and reruns write the same bytes
  return Math.round(angle * 10) / 10 || 0
}

/**
 * The ears' angles, in degrees clockwise, `seconds` into the flick: the far ear tips outward and springs
 * back, and the near ear answers a beat later, less and the other way.
 */
export function flickAngles(seconds: number): { near: number; far: number } {
  return { far: springAngle(mark.flick.springs.far, seconds), near: springAngle(mark.flick.springs.near, seconds) }
}

/** The flick sampled every `stepMs`, as `[ms, far, near]`: what mark.json's `keyframes` must hold. */
export function computeKeyframes(): [number, number, number][] {
  const { durationMs, stepMs } = mark.flick
  const frames: [number, number, number][] = []
  for (let ms = 0; ms < durationMs; ms += stepMs) {
    const { far, near } = flickAngles(ms / 1000)
    frames.push([ms, far, near])
  }
  return frames
}

/** The keyframes every animated copy of the mark plays, as `[ms, far, near]`. */
export const FLICK_KEYFRAMES = mark.flick.keyframes as [number, number, number][]

/** Where both ears turn, and the timing of the loop the animated files play. */
export const EAR_FLICK = {
  pivot: { x: mark.flick.pivot[0], y: mark.flick.pivot[1] },
  stepMs: mark.flick.stepMs,
  restMs: mark.flick.restMs,
} as const

/** mark.json as the repository keeps it: two-space JSON, with each short number list on one line. */
export function formatMarkJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2).replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (_, list: string) => `[${list.split(/,\s+/).join(', ')}]`)}\n`
}
