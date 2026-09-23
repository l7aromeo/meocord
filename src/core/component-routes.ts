import { type CommandType } from '@src/enum/index.js'
import { type CommandMetadata } from '@src/interface/index.js'
import { findAmbiguousRoutes, getCommandMap } from '@src/decorator/controller.decorator.js'

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

/** Every customId-pattern route of the given controllers, most specific first, read from metadata alone. */
export function buildComponentRoutes(controllerClasses: readonly ControllerClass[]): ComponentRoute[] {
  const routes: ComponentRoute[] = []
  for (const controllerClass of controllerClasses) {
    const commandMap = getCommandMap(controllerClass.prototype)
    if (!commandMap) continue
    for (const [pattern, metaArray] of Object.entries(commandMap)) {
      if (!Array.isArray(metaArray)) continue
      for (const meta of metaArray) {
        if (meta.regex) routes.push({ controllerClass, meta, pattern })
      }
    }
  }
  return routes.sort((a, b) => (b.meta.specificity ?? 0) - (a.meta.specificity ?? 0))
}

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
