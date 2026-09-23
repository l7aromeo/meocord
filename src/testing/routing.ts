import { CommandType, MetadataKey } from '@src/enum/index.js'
import {
  buildComponentRoutes,
  type ControllerClass,
  findComponentRouteConflicts,
  matchComponentRoute,
} from '@src/core/component-routes.js'
import { isCustomIdRouted } from '@src/util/interaction.util.js'

/** The command types routed by customId pattern: buttons, select menus and modals. */
export type ComponentCommandType = Exclude<
  CommandType,
  CommandType.SLASH | CommandType.CONTEXT_MENU | CommandType.PRIMARY_ENTRY_POINT
>

/** The handler a component interaction reaches. */
export interface ResolvedRoute {
  /** The controller class declaring the handler. */
  controller: ControllerClass
  /** The name of the handler method. */
  method: string
  /**
   * The handler method itself, for assertions that survive renaming it:
   * `expect(route?.handler).toBe(ProfileController.prototype.showProfile)`.
   */
  handler: (...args: any[]) => unknown
  /** The values captured by the pattern's `{name}` segments. */
  params: Record<string, string>
}

/** Two patterns of one component type that can both match a customId. */
export interface RouteConflict {
  type: ComponentCommandType
  patterns: [string, string]
}

/** The controllers `@MeoCord({ controllers })` registers on an application class. */
function controllersOf(app: ControllerClass): ControllerClass[] {
  const options = Reflect.getMetadata(MetadataKey.AppOptions, app) as { controllers?: ControllerClass[] } | undefined
  if (!options) throw new TypeError(`${app.name || 'The given class'} is not decorated with @MeoCord().`)
  return options.controllers ?? []
}

/**
 * Resolves which handler a component's customId reaches, the way dispatch does: across every
 * controller the application registers, for that component type, most specific pattern first.
 *
 * Reads decorator metadata only, so it runs in a plain unit test with no Discord client, config
 * or container. It checks routing alone: guards are not run, and whether the controller's
 * dependencies are bound is for `MeoCordTestingModule` to test.
 *
 * @param app - The application class decorated with `@MeoCord`.
 * @param component - The component type and the customId it carries.
 * @returns The handler that runs, or `undefined` when no route handles the customId.
 *
 * @example
 * ```ts
 * const route = resolveRoute(App, { type: CommandType.BUTTON, customId: 'profile/111/8000' })
 * expect(route?.handler).toBe(ProfileController.prototype.showProfile)
 * expect(route?.params).toEqual({ ownerId: '111', uid: '8000' })
 * ```
 */
export function resolveRoute(
  app: ControllerClass,
  component: { type: ComponentCommandType; customId: string },
): ResolvedRoute | undefined {
  if (!isCustomIdRouted(component.type)) {
    throw new TypeError(`${component.type} commands are routed by name, not by customId.`)
  }
  const routes = buildComponentRoutes(controllersOf(app))
  const matched = matchComponentRoute(routes, type => type === component.type, component.customId)
  if (!matched) return undefined
  const { route, params } = matched
  const method = route.meta.methodName
  return { controller: route.controllerClass, method, handler: route.controllerClass.prototype[method], params }
}

/**
 * Finds component patterns that can match the same customId, which MeoCord otherwise only warns
 * about at startup. Patterns are compared within a component type, as dispatch does.
 *
 * @param app - The application class decorated with `@MeoCord`.
 * @returns Each conflicting pattern pair, with its component type.
 *
 * @example
 * ```ts
 * expect(findRouteConflicts(App)).toEqual([])
 * ```
 */
export function findRouteConflicts(app: ControllerClass): RouteConflict[] {
  return findComponentRouteConflicts(buildComponentRoutes(controllersOf(app))) as RouteConflict[]
}
