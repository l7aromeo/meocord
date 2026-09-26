import 'reflect-metadata'
import { type Container } from 'inversify'
import { type ThemeOverride } from '@src/interface/index.js'
import { sourcePrototype, stageClasses } from '@src/core/guard-runner.js'
import {
  ambientThemeVersion,
  claimAmbientTheme,
  defaultTheme,
  hasAmbientTheme,
  mergeTheme,
  ownsAmbientTheme,
  type ResolvedTheme,
  themeLayersVersion,
} from '@src/core/theme-scope.js'

/** Private metadata: the theme layer a class-level `@UseTheme` sets, kept on the class. */
export const CLASS_THEME = Symbol('class_theme')

/** Private metadata: the theme layer a method-level `@UseTheme` sets. */
export const METHOD_THEME = Symbol('method_theme')

/** Classes with a `@UseTheme`, on the class or one of its methods. */
export const THEMED_CLASSES = new WeakSet<object>()

/** One app's themes: its own layer, and the resolved themes built from it. */
interface AppThemes {
  layer: ThemeOverride | undefined
  /** Whether a `@UseTheme` applies to any of the app's classes, so handlers can differ in theme. */
  varies: boolean
  /** The version of the layers beneath the app's that `app` and `handlers` were built on. */
  version: number
  /** The version of the app read outside a call that `scoped` was decided with. */
  ambientVersion: number
  app: ResolvedTheme
  /** The theme a call of a handler without a `@UseTheme` runs with, or `undefined` when it needs no scope. */
  scoped: ResolvedTheme | undefined
  handlers: WeakMap<object, Map<string, ResolvedTheme>>
}

const apps = new WeakMap<Container, AppThemes>()

/** The classes on `cls`'s prototype chain, itself first. */
function chainOf(cls: object): object[] {
  const chain: object[] = []
  for (let prototype = (cls as { prototype?: object }).prototype; prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
    chain.push(prototype.constructor)
  }
  return chain
}

/**
 * Records an app's theme and whether its handlers can differ in theme, at startup. `layer` is the app's
 * `@MeoCord({ theme })`, already checked and copied.
 */
export function configureThemes(container: Container, layer: ThemeOverride | undefined, classes: readonly object[]): void {
  const varies = classes.some(cls => chainOf(cls).some(link => THEMED_CLASSES.has(link)))
  apps.set(container, { layer, varies, version: -1, ambientVersion: -1, app: defaultTheme(), scoped: undefined, handlers: new WeakMap() })
}

/** The app's themes, built again when the layers beneath the app's have changed. */
function current(container: Container): AppThemes | undefined {
  const themes = apps.get(container)
  if (themes && themes.version !== themeLayersVersion()) {
    themes.version = themeLayersVersion()
    themes.app = mergeTheme(defaultTheme(), themes.layer)
    themes.handlers = new WeakMap()
    rescope(container, themes)
  } else if (themes && themes.ambientVersion !== ambientThemeVersion()) {
    rescope(container, themes)
  }
  return themes
}

/**
 * Decides whether the app's calls need a scope, again whenever the layers beneath it or the app read outside a call
 * change. They do when the handlers can differ in theme. Otherwise a call reads the theme outside a call, so it
 * needs one unless that is its own theme: when the app owns it, or when no app does and the app's theme is MeoCord's
 * defaults.
 */
function rescope(container: Container, themes: AppThemes): void {
  themes.ambientVersion = ambientThemeVersion()
  const readsOwnTheme = ownsAmbientTheme(container) || (!hasAmbientTheme() && themes.app === defaultTheme())
  themes.scoped = themes.varies || !readsOwnTheme ? themes.app : undefined
}

/** The app's theme: MeoCord's defaults and the app's `@MeoCord({ theme })`, or the defaults for a container with none. */
export function appTheme(container: Container): ResolvedTheme {
  return current(container)?.app ?? defaultTheme()
}

/** A handler's theme: the app's, then each class's `@UseTheme` from the base class down, then the method's. */
function handlerTheme(themes: AppThemes, prototype: object, methodName: string): ResolvedTheme {
  let byMethod = themes.handlers.get(prototype)
  if (!byMethod) themes.handlers.set(prototype, (byMethod = new Map()))
  let theme = byMethod.get(methodName)
  if (theme) return theme
  theme = themes.app
  // Outermost first, so reversed: a subclass's layer goes over its base class's
  for (const cls of [...stageClasses(prototype, methodName)].reverse()) {
    theme = mergeTheme(theme, Reflect.getOwnMetadata(CLASS_THEME, cls) as ThemeOverride | undefined)
  }
  const source = sourcePrototype(prototype, methodName)
  if (source) theme = mergeTheme(theme, Reflect.getOwnMetadata(METHOD_THEME, source, methodName) as ThemeOverride | undefined)
  byMethod.set(methodName, theme)
  return theme
}

/**
 * The theme a call runs with, or `undefined` when it needs no scope of its own: the app's handlers share one theme,
 * and that is MeoCord's defaults or the theme read outside any call. So an app that sets no `@UseTheme` pays one
 * check per call. Without a handler, as for an error no route took, the app's theme.
 */
export function callTheme(container: Container, prototype?: object, methodName?: string): ResolvedTheme | undefined {
  const themes = current(container)
  if (!themes?.scoped) return undefined
  return themes.varies && prototype && methodName ? handlerTheme(themes, prototype, methodName) : themes.scoped
}

/** Makes the app's theme the one read outside a call, unless another app in the process already has. */
export function claimAmbientAppTheme(container: Container): void {
  claimAmbientTheme(container, () => appTheme(container))
}
