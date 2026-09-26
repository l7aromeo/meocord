import { type CommandType } from '@src/enum/index.js'
import { type CommandMetadata } from '@src/interface/index.js'
import { findAmbiguousRoutes, getCommandMap, patternShape } from '@src/decorator/controller.decorator.js'

export type ControllerClass = new (...args: any[]) => any

/** A `@Command` route matched by customId pattern. */
export interface ComponentRoute {
  controllerClass: ControllerClass
  meta: CommandMetadata<string>
  pattern: string
}

/** Two patterns of one component type that can both match a customId. */
export interface ComponentRouteConflict {
  type: CommandType
  patterns: [string, string]
}

/**
 * Every customId-pattern route of the given controllers, most specific first, read from metadata alone.
 * Throws for two handlers whose patterns match the same customIds of one component type; one handler
 * declared under two spellings of a pattern keeps one route.
 */
export function buildComponentRoutes(controllerClasses: readonly ControllerClass[]): ComponentRoute[] {
  const routes: ComponentRoute[] = []
  // By component type and pattern shape: the route that shape already has
  const seen = new Map<string, ComponentRoute>()
  for (const controllerClass of controllerClasses) {
    const commandMap = getCommandMap(controllerClass.prototype)
    if (!commandMap) continue
    for (const [pattern, metaArray] of Object.entries(commandMap)) {
      if (!Array.isArray(metaArray)) continue
      for (const meta of metaArray) {
        if (!meta.regex) continue
        const route = { controllerClass, meta, pattern }
        const key = `${meta.type}\0${patternShape(pattern)}`
        const earlier = seen.get(key)
        if (!earlier) {
          seen.set(key, route)
          routes.push(route)
          continue
        }
        // One handler under two spellings, such as 'card/{id}' and 'card/{cardId}', is one route
        if (earlier.controllerClass === controllerClass && earlier.meta.methodName === meta.methodName) continue
        throw new Error(
          `"${earlier.pattern}" in ${earlier.controllerClass.name}.${earlier.meta.methodName} and "${pattern}" in ` +
            `${controllerClass.name}.${meta.methodName} match the same ${typeLabel(meta.type)} customIds, so only one ` +
            `of them could ever run. Change one pattern.`,
        )
      }
    }
  }
  return routes.sort((a, b) => (b.meta.specificity ?? 0) - (a.meta.specificity ?? 0))
}

/** A component type as an error names it: `button`, `modal submit`, `string select menu`. */
const typeLabel = (type: CommandType): string => type.toLowerCase().replaceAll('_', ' ')

/**
 * The route dispatch runs for a customId: the first, in rank order, whose type `acceptsType` allows
 * and whose pattern matches, with the captured params.
 */
export function matchComponentRoute(
  routes: readonly ComponentRoute[],
  acceptsType: (type: CommandType) => boolean,
  customId: string,
): { route: ComponentRoute; params: Record<string, string> } | undefined {
  for (const route of routes) {
    if (!acceptsType(route.meta.type)) continue
    const match = route.meta.regex!.exec(customId)
    if (match) return { route, params: { ...match.groups } }
  }
  return undefined
}

/** Pattern pairs that can match one customId, compared only within a component type, as dispatch does. */
export function findComponentRouteConflicts(routes: readonly ComponentRoute[]): ComponentRouteConflict[] {
  const byType = new Map<CommandType, string[]>()
  for (const { meta, pattern } of routes) byType.set(meta.type, [...(byType.get(meta.type) ?? []), pattern])
  return [...byType].flatMap(([type, patterns]) => findAmbiguousRoutes(patterns).map(pair => ({ type, patterns: pair })))
}
