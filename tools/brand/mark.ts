/**
 * The mark's data: a cat's two ears peeking over the cord, drawn on a 16-unit grid. The twin of
 * `src/lib/brand/mark-paths.ts` in meocord/docs; change both together.
 */
export const MARK_VIEWBOX = [0, 0, 16, 16] as const

/** The smallest size, in device pixels, that draws the inner ears. */
export const NOTCH_MIN_SIZE = 48

export const MARK_PATHS = {
  /** Both ears, joined by the curve of the head's crown between them. */
  crown:
    'M2.4 12Q1.9 7.2 3.4 4.1Q4.1 2.8 5 3.8Q6.4 5.6 7.3 8Q8.4 7.6 9.6 8.4Q11 6.9 12.9 6.1Q13.9 5.3 14.1 6.4Q14.3 9.3 13.4 12Z',
  /** The inner ears, cut out of the crown (even-odd) at the larger size. */
  inner: 'M3.7 9.6Q3.6 7 4.3 5.6Q5.6 7.4 6.2 9.6ZM10.8 9.8Q11.8 8.3 12.9 7.6Q13.1 8.8 12.8 9.8Z',
  /** The cord they peek over, drawn in front of them. */
  cord: 'M2.25 10.5H13.75Q15 10.5 15 11.75Q15 13 13.75 13H2.25Q1 13 1 11.75Q1 10.5 2.25 10.5Z',
} as const

/** The ears' path for a size in device pixels: notched from NOTCH_MIN_SIZE up, the plain crown below. */
export function earsPath(size: number): string {
  return size >= NOTCH_MIN_SIZE ? MARK_PATHS.crown + MARK_PATHS.inner : MARK_PATHS.crown
}

/** Tile corner radius, in grid units. */
export const MARK_TILE_RADIUS = 3.5

/** Where the valley between the ears sits, in grid units: the far ear tips about it. */
export const EAR_VALLEY_X = 9.6

/**
 * How the ears split to move apart, in grid units. Both turn about the valley between them, where the
 * crown dips lowest. Each is drawn in rectangles, `[x, y, width, height]`, that meet at the valley and
 * overlap only in the solid crown below it, so no seam or notch shows at any angle; their bases swing
 * under the cord.
 */
export const EAR_FLICK = {
  pivot: { x: EAR_VALLEY_X, y: 8.4 },
  near: [
    [0, 0, EAR_VALLEY_X, 16],
    [EAR_VALLEY_X, 8.9, 0.3, 7.1],
  ],
  far: [
    [EAR_VALLEY_X, 0, 16 - EAR_VALLEY_X, 16],
    [EAR_VALLEY_X - 0.3, 8.9, 0.3, 7.1],
  ],
  /** How long the flick lasts, in seconds; the angles below are back to 0 by then. */
  duration: 0.8,
} as const

/**
 * The ears' angles, in degrees clockwise, `seconds` into the flick: the far ear tips outward and springs
 * back with one small overshoot, and the near ear answers a beat later, less and the other way.
 */
export function flickAngles(seconds: number): { near: number; far: number } {
  const spring = (t: number, amplitude: number, decay: number) =>
    t <= 0 ? 0 : amplitude * Math.exp(-t / decay) * Math.sin((2 * Math.PI * t) / 0.3)
  // Rounded, so the settled frames are exactly still and reruns write the same bytes
  const round = (angle: number) => Math.round(angle * 10) / 10 || 0
  return { far: round(spring(seconds, 17.5, 0.1)), near: round(spring(seconds - 0.08, -7, 0.1)) }
}

export interface MarkColours {
  tile: string
  ink: string
  accent: string
}

/** The graphite tile the logo and app icons use. */
export const MARK_DARK: MarkColours = { tile: '#1E1E21', ink: 'rgba(255,255,255,0.88)', accent: '#8C98FF' }

/** The accent-tint tile the avatar uses. */
export const MARK_TINT: MarkColours = { tile: '#262A45', ink: 'rgba(255,255,255,0.92)', accent: '#8C98FF' }
