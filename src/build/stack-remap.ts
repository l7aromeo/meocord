import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'

type PrepareStackTrace = (error: Error, sites: NodeJS.CallSite[]) => unknown

/**
 * Maps stack traces to the source through the `.map` beside the bundle, when the runtime maps nothing itself:
 * under Bun, or Node without `--enable-source-maps`. A hook already set receives the mapped call sites, and
 * each map is read the first time a stack needs it. Returns whether the hook was installed.
 */
export function installStackRemapper(bundle: string): boolean {
  if (process.sourceMapsEnabled) return false
  if (!existsSync(`${bundle}.map`)) return false

  const directory = path.dirname(bundle)
  // Windows paths compare without case: a drive letter can come back upper or lower
  const inDirectory = (file: string) =>
    process.platform === 'win32'
      ? path.dirname(file).toLowerCase() === directory.toLowerCase()
      : path.dirname(file) === directory
  // One map per file, or null for a file with none or one that cannot be read
  const maps = new Map<string, TraceMap | null>()
  const mapFor = (file: string): TraceMap | null => {
    const cached = maps.get(file)
    if (cached !== undefined) return cached
    // Set first, so an error while reading the map formats its own stack without reading it again
    maps.set(file, null)
    if (!inDirectory(file) || !existsSync(`${file}.map`)) return null
    const map = new TraceMap(readFileSync(`${file}.map`, 'utf8'))
    maps.set(file, map)
    return map
  }

  const previous = Error.prepareStackTrace as PrepareStackTrace | undefined
  // Named, so a stack hook can be told apart from the runtime's own, which Node and Bun both define
  function meocordSourceMappedStackTrace(error: Error, sites: NodeJS.CallSite[]): unknown {
    let mapped = sites
    try {
      mapped = sites.map(site => remapSite(site, directory, mapFor))
    } catch {
      // A stack is never lost to a map that cannot be read: it keeps the bundle's positions.
    }
    return previous ? previous(error, mapped) : formatStack(error, mapped)
  }
  Error.prepareStackTrace = meocordSourceMappedStackTrace
  return true
}

/** A call site at its source position, or the site itself when its file has no map or the map no entry. */
function remapSite(site: NodeJS.CallSite, directory: string, mapFor: (file: string) => TraceMap | null): NodeJS.CallSite {
  const name = site.getFileName()
  const line = site.getLineNumber()
  const column = site.getColumnNumber()
  if (!name || !line || !column) return site

  const file = name.startsWith('file://') ? fileURLToPath(name) : name
  const map = mapFor(file)
  if (!map) return site
  const position = originalPositionFor(map, { line, column: column - 1 })
  if (!position.source || position.line === null || position.column === null) return site

  // Sources are relative to the map, such as ../src/main.ts; a scheme such as webpack:// stays as written
  const source = /^[a-z][a-z\d+.-]*:\/\//i.test(position.source)
    ? position.source
    : path.resolve(directory, position.source)
  return mappedSite(site, name, source, position.line, position.column + 1)
}

/**
 * A call site that reports a source position and delegates everything else to the runtime's own. Its
 * `toString()` is the runtime's frame with only the location replaced, so the frame keeps its format. The
 * methods sit on its prototype, as a runtime's do, for hooks that clone a call site from its prototype.
 */
function mappedSite(site: NodeJS.CallSite, name: string, source: string, line: number, column: number): NodeJS.CallSite {
  const delegated: Record<string, unknown> = {}
  let prototype: object | null = Object.getPrototypeOf(site)
  for (; prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
      const value = (site as unknown as Record<string, unknown>)[key]
      if (key !== 'constructor' && typeof value === 'function' && !(key in delegated)) {
        delegated[key] = (...args: unknown[]) => (value as (...args: unknown[]) => unknown).apply(site, args)
      }
    }
  }

  const location = `${source}:${line}:${column}`
  const original = `${name}:${site.getLineNumber()}:${site.getColumnNumber()}`
  const methods = Object.assign(delegated, {
    getFileName: () => source,
    getScriptNameOrSourceURL: () => source,
    getLineNumber: () => line,
    getColumnNumber: () => column,
    toString: () => {
      const frame = String(site)
      const at = frame.lastIndexOf(original)
      if (at !== -1) return frame.slice(0, at) + location + frame.slice(at + original.length)
      const functionName = site.getFunctionName()
      return functionName ? `${functionName} (${location})` : location
    },
  })
  return Object.create(methods) as NodeJS.CallSite
}

/** The stack as the runtime writes it with no hook: the error's own text, then a line per frame. */
function formatStack(error: Error, sites: NodeJS.CallSite[]): string {
  let header: string
  try {
    header = Error.prototype.toString.call(error)
  } catch {
    header = '<error>'
  }
  return header + sites.map(site => `\n    at ${String(site)}`).join('')
}
