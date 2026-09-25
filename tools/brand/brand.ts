// Draws MeoCord's brand files with meo-canvas: `bun run brand`, then commit what it writes to
// docs/assets/brand/. What each file is, and why, is in that folder's README.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Box, Column, ease, Path, Root, Row, Text } from 'meo-canvas'
import {
  EAR_FLICK,
  EAR_VALLEY_X,
  earsPath,
  flickAngles,
  MARK_DARK,
  MARK_PATHS,
  MARK_TILE_RADIUS,
  MARK_TINT,
  MARK_VIEWBOX,
} from './mark.js'
import type { MarkColours } from './mark.js'

const HERE = import.meta.dirname
const OUT = path.resolve(HERE, '../../docs/assets/brand')
const FONTS = path.join(HERE, 'fonts')
const fonts = [
  { family: 'Instrument Sans', paths: ['InstrumentSans-Regular.ttf', 'InstrumentSans-SemiBold.ttf'] },
  { family: 'JetBrains Mono', paths: ['JetBrainsMono-Regular.ttf', 'JetBrainsMono-SemiBold.ttf'] },
].map(font => ({ ...font, paths: font.paths.map(file => path.join(FONTS, file)) }))

const W = 1280
const PAD = 56
/** Two and a half seconds at 30fps: five steps of 0.3 s, the reply, and a pause before the loop. */
const FPS = 30
const DURATION = 2.5

const MONO = 17
/** One JetBrains Mono character at 17px, 0.6em. Text trims its spaces, so indents and gaps are margins. */
const CH = MONO * 0.6
const LINE_H = 30
const SHEET_W = 700
const SHEET_PAD = 22
const EARS = 104
/** Where the sheet's top edge crosses the ears, in grid units: the lower third of the ears sits behind it. */
const EAR_EDGE = 8.8

interface Theme {
  field: string
  sheet: string
  edge: string
  ink: string
  muted: string
  quiet: string
  accent: string
  string: string
  band: string
  tile: string
}

/** Dark and light for GitHub; neutral, a mid-slate that reads on a white page and a dark one, for npm. */
const THEMES: Record<'dark' | 'light' | 'neutral', Theme> = {
  dark: {
    field: '#161618',
    sheet: '#1E1E21',
    edge: 'rgba(255,255,255,0.10)',
    ink: 'rgba(255,255,255,0.88)',
    muted: 'rgba(255,255,255,0.62)',
    quiet: 'rgba(255,255,255,0.40)',
    accent: '#8C98FF',
    string: '#E2C08D',
    band: 'rgba(140,152,255,0.14)',
    tile: '#26262A',
  },
  light: {
    field: '#F2F2F4',
    sheet: '#FFFFFF',
    edge: 'rgba(22,22,24,0.10)',
    ink: 'rgba(22,22,24,0.88)',
    muted: 'rgba(22,22,24,0.62)',
    quiet: 'rgba(22,22,24,0.48)',
    accent: '#4B5BD7',
    string: '#8A5A12',
    band: 'rgba(75,91,215,0.10)',
    tile: '#E4E7FB',
  },
  neutral: {
    field: '#262936',
    sheet: '#2E3240',
    edge: 'rgba(255,255,255,0.12)',
    ink: 'rgba(255,255,255,0.90)',
    muted: 'rgba(255,255,255,0.64)',
    quiet: 'rgba(255,255,255,0.44)',
    accent: '#9AA5FF',
    string: '#E2C08D',
    band: 'rgba(154,165,255,0.16)',
    tile: '#353A55',
  },
}

/** The controller method between the fixture's region markers, dedented. */
function snippet(): string[] {
  const source = readFileSync(path.join(HERE, 'banner-snippet.ts'), 'utf8').split('\n')
  const start = source.findIndex(line => line.trim() === '// #region banner')
  const end = source.findIndex(line => line.trim() === '// #endregion banner')
  if (start === -1 || end <= start) throw new Error('banner-snippet.ts has no "banner" region.')
  const lines = source.slice(start + 1, end)
  const indent = Math.min(...lines.filter(line => line.trim()).map(line => /^ */.exec(line)![0].length))
  return lines.map(line => line.slice(indent))
}

const LINES = snippet()
/** The lines in the order a call runs them: the command, its guard, its cooldown, the handler, respond(). */
const STEPS = [
  LINES.findIndex(line => line.startsWith('@Command')),
  LINES.findIndex(line => line.startsWith('@UseGuard')),
  LINES.findIndex(line => line.startsWith('@Cooldown')),
  LINES.findIndex(line => line.startsWith('async ')),
  LINES.findIndex(line => line.includes('respond(')),
]
if (STEPS.includes(-1)) throw new Error('banner-snippet.ts lacks a line the banner steps through.')

/** Where the loop stands at `time`: the band's line (fractional while moving) and what has faded in. */
function stateAt(time: number) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const first = 0.15
  const respondAt = first + (STEPS.length - 1) * 0.3
  let line = STEPS[0]
  for (let step = 1; step < STEPS.length; step++) {
    line += (STEPS[step] - STEPS[step - 1]) * ease('outCubic', clamp((time - first - step * 0.3) / 0.12))
  }
  const fadeOut = clamp((time - 2.15) / 0.25)
  return {
    line,
    band: clamp((time - 0.05) / 0.1) * (1 - fadeOut),
    reply: 0.18 + 0.82 * clamp((time - respondAt) / 0.25) * (1 - fadeOut),
    // The glance: the far ear tips out a few degrees and back as the reply lands
    tip: 7 * Math.sin(Math.PI * clamp((time - respondAt) / 0.5)),
  }
}

type State = ReturnType<typeof stateAt>

/** The end of a call, for stills: the band on respond() and the reply shown. */
const SETTLED: State = { line: STEPS[STEPS.length - 1], band: 1, reply: 1, tip: 0 }

function markNode(size: number, colours: MarkColours, radius = MARK_TILE_RADIUS) {
  const layer = (d: string, fill: string, fillRule: 'nonzero' | 'evenodd') =>
    Path({
      positionType: 'absolute',
      position: { top: 0, left: 0 },
      width: size,
      height: size,
      viewBox: [...MARK_VIEWBOX],
      d,
      fill,
      fillRule,
    })
  return Box({
    width: size,
    height: size,
    positionType: 'relative',
    overflow: 'hidden',
    backgroundColor: colours.tile,
    borderRadius: (radius * size) / 16,
    children: [layer(earsPath(size), colours.ink, 'evenodd'), layer(MARK_PATHS.cord, colours.accent, 'nonzero')],
  })
}

/**
 * The ears alone, filled as on the tile mark: the crown in the tile's colour, the notched ears in ink
 * over it. Split at the valley so the far one can tip about the point where it meets the sheet; the
 * two halves overlap a little, so the tipped ear leaves no gap.
 */
function ears(theme: Theme, tip: number) {
  const unit = EARS / 16
  const layer = (left: number, d: string, fill: string, fillRule: 'nonzero' | 'evenodd') =>
    Path({ positionType: 'absolute', position: { top: 0, left }, width: EARS, height: EARS, viewBox: [...MARK_VIEWBOX], d, fill, fillRule })
  const path = (left: number) => [
    layer(left, MARK_PATHS.crown, theme.tile, 'nonzero'),
    layer(left, earsPath(EARS), theme.ink, 'evenodd'),
  ]
  const split = EAR_VALLEY_X - 0.2
  return Box({
    width: EARS,
    height: EARS,
    positionType: 'relative',
    children: [
      Box({
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: (EAR_VALLEY_X + 0.4) * unit,
        height: EARS,
        overflow: 'hidden',
        children: path(0),
      }),
      Box({
        positionType: 'absolute',
        position: { top: 0, left: split * unit },
        width: (16 - split) * unit,
        height: EARS,
        overflow: 'hidden',
        transform: { rotate: tip, originX: 0.2 * unit, originY: EAR_EDGE * unit },
        children: path(-split * unit),
      }),
    ],
  })
}

/** `rgba(r,g,b,a)` over an opaque `#rrggbb`, as the opaque colour it shows. */
function flatten(rgba: string, background: string): string {
  const [r, g, b, a] = /rgba\(([^)]+)\)/.exec(rgba)![1].split(',').map(Number)
  const bg = [1, 3, 5].map(i => parseInt(background.slice(i, i + 2), 16))
  return `#${[r, g, b].map((c, i) => Math.round(c * a + bg[i] * (1 - a)).toString(16).padStart(2, '0')).join('')}`
}

/**
 * The mark with its ears at the given angles, for the animated logo and avatar: each ear clipped to its
 * half and turned about its pivot, the cord drawn last so it covers their bases, as on the still mark.
 * The ink is made opaque against `behind`, the colour it sits on, so the halves' overlap is not drawn twice.
 */
function animatedMark(
  size: number,
  colours: MarkColours,
  angles: { near: number; far: number },
  radius = MARK_TILE_RADIUS,
  behind = colours.tile,
) {
  const unit = size / 16
  const ink = flatten(colours.ink, behind)
  const layer = (left: number, d: string, fill: string, fillRule: 'nonzero' | 'evenodd') =>
    Path({ positionType: 'absolute', position: { top: 0, left }, width: size, height: size, viewBox: [...MARK_VIEWBOX], d, fill, fillRule })
  const { pivot } = EAR_FLICK
  // One ear: its rectangles of the ears path, turned together about the valley
  const ear = (regions: readonly (readonly number[])[], angle: number) =>
    Box({
      positionType: 'absolute',
      position: { top: 0, left: 0 },
      width: size,
      height: size,
      transform: { rotate: angle, originX: pivot.x * unit, originY: pivot.y * unit },
      children: regions.map(([x, y, width, height]) =>
        Box({
          positionType: 'absolute',
          position: { top: y * unit, left: x * unit },
          width: width * unit,
          height: height * unit,
          overflow: 'hidden',
          children: [
            Path({
              positionType: 'absolute',
              position: { top: -y * unit, left: -x * unit },
              width: size,
              height: size,
              viewBox: [...MARK_VIEWBOX],
              d: earsPath(size),
              fill: ink,
              fillRule: 'evenodd',
            }),
          ],
        }),
      ),
    })
  return Box({
    width: size,
    height: size,
    positionType: 'relative',
    overflow: 'hidden',
    backgroundColor: colours.tile,
    borderRadius: (radius * size) / 16,
    children: [
      ear(EAR_FLICK.near, angles.near),
      ear(EAR_FLICK.far, angles.far),
      layer(0, MARK_PATHS.cord, colours.accent, 'nonzero'),
    ],
  })
}

/** Frames of the flick: a long rest, then the flick every 30 ms, looping seamlessly from still to still. */
const REST_MS = 2200
const FLICK_FRAME_MS = 30
const FLICK_FRAMES = Math.round((EAR_FLICK.duration * 1000) / FLICK_FRAME_MS)
const flickFrameDelays = [REST_MS, ...Array.from({ length: FLICK_FRAMES }, () => FLICK_FRAME_MS)]
const flickAnglesAt = (page: number) => (page === 0 ? { near: 0, far: 0 } : flickAngles(((page - 1) * FLICK_FRAME_MS) / 1000))

/** Renders `mark` for every frame of the flick, in `formats`, on a transparent or given background. */
async function animatedMarkFiles(
  size: number,
  background: string,
  mark: (angles: { near: number; far: number }) => ReturnType<typeof Box>,
  files: [string, 'gif' | 'webp'][],
): Promise<string[]> {
  const canvas = await Root({
    width: size,
    height: size,
    // One page per frame; each frame's own delay sets the timing
    duration: flickFrameDelays.length,
    fps: 1,
    backgroundColor: background,
    children: page => mark(flickAnglesAt(page.index)),
  })
  const written: string[] = []
  for (const [file, format] of files) {
    written.push(await write(file, await canvas.toBuffer(format, { frameDelays: flickFrameDelays, loop: 0 })))
  }
  canvas.release()
  return written
}

/** One line of code, coloured by token. Spaces at a run's ends become margins, since Text trims them. */
function codeLine(line: string, theme: Theme) {
  const indent = /^ */.exec(line)![0].length
  const runs = line
    .trim()
    .split(/(@\w+|'[^']*'|\basync\b|\bawait\b)/)
    .filter(Boolean)
  return Row({
    height: LINE_H,
    alignItems: 'center',
    padding: { left: 24 + indent * CH },
    children: runs.map(run => {
      const color = run.startsWith('@')
        ? theme.accent
        : run.startsWith("'")
          ? theme.string
          : run === 'async' || run === 'await'
            ? theme.muted
            : theme.ink
      const lead = /^ */.exec(run)![0].length
      const trail = /( *)$/.exec(run)![1].length
      return Text(run.trim(), {
        fontFamily: 'JetBrains Mono',
        fontSize: MONO,
        color,
        margin: { left: lead * CH, right: trail * CH },
      })
    }),
  })
}

/** The code sheet, the band stepping down it, and the ears seated on its top edge. */
function sheet(theme: Theme, state: State) {
  const top = SHEET_PAD + state.line * LINE_H
  const code = Box({
    width: SHEET_W,
    positionType: 'relative',
    padding: { top: SHEET_PAD, bottom: SHEET_PAD, right: 24 },
    backgroundColor: theme.sheet,
    borderRadius: 14,
    border: 1,
    borderStyle: 'solid',
    borderColor: theme.edge,
    overflow: 'hidden',
    children: [
      Box({
        positionType: 'absolute',
        position: { top, left: 0 },
        width: SHEET_W,
        height: LINE_H,
        opacity: state.band,
        backgroundColor: theme.band,
      }),
      Box({
        positionType: 'absolute',
        position: { top, left: 0 },
        width: 3,
        height: LINE_H,
        opacity: state.band,
        backgroundColor: theme.accent,
      }),
      Column({ children: LINES.map(line => codeLine(line, theme)) }),
    ],
  })
  // Drawn before the sheet, so the sheet covers the ears' base and they sit on its top edge
  return Box({
    width: SHEET_W,
    positionType: 'relative',
    children: [
      Box({
        positionType: 'absolute',
        position: { top: -EAR_EDGE * (EARS / 16), left: SHEET_W - EARS - 56 },
        children: [ears(theme, state.tip)],
      }),
      code,
    ],
  })
}

/** The bot's answer, as a chat message: avatar, name and text. Generic, not Discord's own UI. */
function reply(theme: Theme, opacity: number) {
  return Row({
    gap: 12,
    alignItems: 'flex-start',
    opacity,
    padding: 14,
    backgroundColor: theme.sheet,
    borderRadius: 12,
    border: 1,
    borderStyle: 'solid',
    borderColor: theme.edge,
    children: [
      markNode(36, { tile: theme.tile, ink: theme.ink, accent: theme.accent }),
      Column({
        gap: 4,
        children: [
          Row({
            gap: 8,
            alignItems: 'center',
            children: [
              Text('greeter', { fontSize: 15, fontWeight: 600, color: theme.ink }),
              Text('now', { fontSize: 13, color: theme.quiet }),
            ],
          }),
          Text('Hello, Ada!', { fontSize: 16, color: theme.ink }),
        ],
      }),
    ],
  })
}

function scene(theme: Theme, state: State, height: number) {
  return Row({
    width: W,
    height,
    padding: PAD,
    gap: 40,
    alignItems: 'center',
    backgroundColor: theme.field,
    children: [
      Column({
        gap: 26,
        width: W - PAD * 2 - 40 - SHEET_W,
        children: [
          markNode(72, { tile: theme.tile, ink: theme.ink, accent: theme.accent }),
          Text('MeoCord', { fontSize: 52, fontWeight: 600, color: theme.ink, letterSpacing: -1.4 }),
          Text('Decorator-based Discord bots, with the pipeline you’d build yourself.', {
            fontSize: 20,
            lineHeight: 1.35,
            color: theme.muted,
          }),
        ],
      }),
      Column({
        gap: 18,
        children: [sheet(theme, state), Row({ justifyContent: 'flex-end', children: [reply(theme, state.reply)] })],
      }),
    ],
  })
}

async function write(file: string, bytes: Buffer | Uint8Array | string): Promise<string> {
  writeFileSync(path.join(OUT, file), bytes)
  return `${file} ${(Buffer.byteLength(bytes) / 1024).toFixed(0)} KiB`
}

async function still(width: number, height: number, background: string, node: ReturnType<typeof Box>, scale = 1) {
  const canvas = await Root({ width, height, scale, fonts, fontFamily: 'Instrument Sans', backgroundColor: background, children: node })
  const bytes = await canvas.toBuffer('png')
  canvas.release()
  return bytes
}

/** The logo as SVG, at the larger optical size: the graphite tile, notched ears and the cord. */
function logoSvg(): string {
  const { tile, accent } = MARK_DARK
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX.join(' ')}" width="512" height="512">`,
    `<rect width="16" height="16" rx="${MARK_TILE_RADIUS}" fill="${tile}"/>`,
    `<path d="${earsPath(512)}" fill="#fff" fill-opacity=".88" fill-rule="evenodd"/>`,
    `<path d="${MARK_PATHS.cord}" fill="${accent}"/>`,
    '</svg>',
    '',
  ].join('\n')
}

/** A square, full-bleed avatar on the accent tint, the mark inset so a circular crop keeps it whole. */
function avatar(size: number) {
  const inset = Math.round(size * 0.18)
  return Box({
    width: size,
    height: size,
    padding: inset,
    backgroundColor: MARK_TINT.tile,
    children: [markNode(size - inset * 2, { ...MARK_TINT, tile: 'rgba(0,0,0,0)' }, 0)],
  })
}

// A frame anywhere in the loop, for looking at the motion: BRAND_FRAME=<seconds> BRAND_THEME=<name> BRAND_SCALE=2
if (process.env.BRAND_FRAME) {
  const theme = THEMES[(process.env.BRAND_THEME ?? 'dark') as keyof typeof THEMES]
  const node = scene(theme, stateAt(Number(process.env.BRAND_FRAME)), 468)
  const bytes = await still(W, 468, theme.field, node, Number(process.env.BRAND_SCALE ?? 1))
  writeFileSync(process.env.BRAND_OUT ?? 'frame.png', bytes)
  process.exit(0)
}

// One moment of the flick, for looking at the ears: BRAND_FLICK=<seconds> BRAND_OUT=frame.png BRAND_SCALE=2
if (process.env.BRAND_FLICK) {
  const node = animatedMark(512, MARK_DARK, flickAngles(Number(process.env.BRAND_FLICK)))
  writeFileSync(process.env.BRAND_OUT ?? 'frame.png', await still(512, 512, 'rgba(0,0,0,0)', node, Number(process.env.BRAND_SCALE ?? 1)))
  process.exit(0)
}

mkdirSync(OUT, { recursive: true })
const written: string[] = []

for (const [name, file] of [
  ['dark', 'banner-dark.webp'],
  ['light', 'banner-light.webp'],
  ['neutral', 'banner.webp'],
] as const) {
  const theme = THEMES[name]
  const canvas = await Root({
    width: W,
    height: 468,
    duration: DURATION,
    fps: FPS,
    fonts,
    fontFamily: 'Instrument Sans',
    backgroundColor: theme.field,
    children: page => scene(theme, stateAt(page.time), 468),
  })
  // 0.8 keeps each animated file near 175 KiB with no visible loss on the flat fills
  written.push(await write(file, await canvas.toBuffer('webp', { fps: FPS, loop: 0, quality: 0.8 })))
  canvas.release()
}
written.push(await write('banner.png', await still(W, 468, THEMES.neutral.field, scene(THEMES.neutral, SETTLED, 468))))
written.push(
  await write('social-preview.png', await still(W, 640, THEMES.dark.field, scene(THEMES.dark, SETTLED, 640))),
)
written.push(await write('logo.svg', logoSvg()))
for (const size of [512, 1024])
  written.push(await write(`logo-${size}.png`, await still(size, size, 'rgba(0,0,0,0)', markNode(size, MARK_DARK))))
written.push(await write('avatar.png', await still(1024, 1024, MARK_TINT.tile, avatar(1024))))

// The same files with the ears flicking once in a three-second loop
const inset = Math.round(1024 * 0.18)
written.push(
  ...(await animatedMarkFiles(
    1024,
    MARK_TINT.tile,
    angles =>
      Box({
        width: 1024,
        height: 1024,
        padding: inset,
        backgroundColor: MARK_TINT.tile,
        children: [animatedMark(1024 - inset * 2, { ...MARK_TINT, tile: 'rgba(0,0,0,0)' }, angles, 0, MARK_TINT.tile)],
      }),
    [['avatar-animated.gif', 'gif']],
  )),
)
written.push(
  ...(await animatedMarkFiles(512, 'rgba(0,0,0,0)', angles => animatedMark(512, MARK_DARK, angles), [
    ['logo-animated.webp', 'webp'],
    ['logo-animated.gif', 'gif'],
  ])),
)

process.stderr.write(`${written.join('\n')}\n${DURATION * FPS} frames, ${DURATION}s at ${FPS}fps\n`)
