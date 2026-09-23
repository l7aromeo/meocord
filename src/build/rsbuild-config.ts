import path from 'path'
import { type RsbuildConfig } from '@rsbuild/core'
import { prepareModifiedTsConfig } from '@src/util/tsconfig.util.js'

/**
 * Native accelerators discord.js reaches for at runtime and works without.
 *
 * `bufferutil` and `utf-8-validate` are `ws`'s optional peers; `zlib-sync` is loaded by
 * `@discordjs/ws` without being declared at all, falling back to uncompressed identify when it
 * is absent. A bundler cannot tell "optional" from "missing", so bundling them fails on
 * `Can't resolve 'zlib-sync'` for every bot. Left as runtime imports, a missing one is caught and
 * ignored, exactly as it is when nothing is bundled.
 *
 * They are externalised as `node-commonjs` rather than plain names. A plain name in an ESM build
 * becomes a hoisted top-level `import`, which throws `Cannot find package 'bufferutil'` before the
 * bot runs a line -- the opposite of the try/catch `ws` wraps around it. `node-commonjs` keeps a
 * runtime `require` at the original call site, so the library's own fallback still applies.
 */
export const DISCORD_OPTIONAL_NATIVES: readonly string[] = ['zlib-sync', 'bufferutil', 'utf-8-validate']

/**
 * The prefix an asset import is joined to at runtime: the output directory, with forward slashes.
 *
 * Rspack writes this into the bundle as a string literal without escaping it. A Windows path
 * came through as `"D:\\a\\meocord\\dist/"` in the source, where `\\a` is a bell character and
 * the other backslashes vanish -- every asset import evaluated to `D:ameocorddist/assets/...`.
 * Windows accepts forward slashes everywhere a path is read, so they are used on every platform.
 */
export function assetPrefixFor(distDir: string): string {
  return `${distDir.replace(/\\/g, '/').replace(/\/+$/, '')}/`
}

/** How the bundler is asked to build an application. */
export interface RsbuildConfigOptions {
  /** Production enables minification; development keeps readable output. */
  mode: 'production' | 'development'
  /** Entry module. Defaults to `src/main.ts` under the current working directory. */
  entry?: string
  /**
   * Bundle production dependencies into the output so it runs without `node_modules`.
   *
   * Off by default: dependencies stay runtime imports and have to be installed beside the
   * output.
   */
  bundleDependencies?: boolean
  /**
   * Modules to leave as runtime imports even when bundling. Native addons are found without being
   * listed -- see createNativeExternals -- so this is for anything kept out for another reason.
   */
  externals?: (string | RegExp)[]
}

/**
 * The bundler configuration MeoCord builds an application with.
 *
 * Built in code rather than read from a config file, so it is typed, testable, and not
 * something a consumer can edit by accident.
 */
export function createRsbuildConfig(options: RsbuildConfigOptions): RsbuildConfig {
  const { mode, bundleDependencies = false, externals = [] } = options
  const cwd = process.cwd()
  const entry = options.entry ?? path.resolve(cwd, 'src', 'main.ts')
  const assetPrefix = assetPrefixFor(path.resolve(cwd, 'dist'))

  return {
    // Rsbuild takes the asset prefix from `dev.assetPrefix` in development and from
    // `output.assetPrefix` in production, and the development default is `/`. Both are set, so an
    // asset import is the same path on disk in either mode.
    dev: { assetPrefix },
    source: {
      entry: { main: entry },
      // Equivalent to experimentalDecorators. The decorators themselves are only half of
      // what MeoCord needs -- see tools.swc below for the half that carries the metadata.
      decorators: { version: 'legacy' },
      tsconfigPath: prepareModifiedTsConfig(),
    },
    tools: {
      swc: {
        jsc: {
          // Rsbuild leaves externalHelpers on, which emits the decorator helpers as imports
          // from `@swc/helpers` -- which in turn wants `tslib` resolvable in the application.
          // Inlining them keeps the output self-contained, which matters most when
          // bundleDependencies is on and there is no node_modules to resolve through.
          externalHelpers: false,
          transform: {
            legacyDecorator: true,
            // Inversify resolves constructor arguments from `design:paramtypes`, which swc
            // emits only with this on. Without it every @Controller throws while its class is
            // being defined. It is deep-merged into builtin:swc-loader rather than replacing
            // it, so the rest of Rsbuild's swc defaults still apply.
            decoratorMetadata: true,
          },
        },
      },
    },
    output: {
      target: 'node',
      // Rsbuild 2 already defaults Node builds to ESM; stated so the output format does not
      // silently change with a future default.
      module: true,
      // Inverted deliberately: autoExternal leaves dependencies as runtime imports, so
      // bundling them means turning it off.
      autoExternal: !bundleDependencies,
      externals: [Object.fromEntries(DISCORD_OPTIONAL_NATIVES.map(name => [name, `node-commonjs ${name}`])), ...externals],
      // Rsbuild would put the bundle in dist/static/js and assets in dist/static/*. The
      // application's entry is dist/main.js, which is what `meocord start` runs.
      distPath: { root: path.resolve(cwd, 'dist'), js: '', image: 'assets', svg: 'assets', font: 'assets', media: 'assets' },
      // No content hash: a bot reads its assets from disk rather than serving them from a CDN,
      // so there is no cache to bust, and stable names keep `dist/assets/` predictable. Each
      // accepts a function too, for applications whose same-named files in different folders
      // would otherwise collide.
      filename: { js: '[name].js', image: '[name][ext]', svg: '[name][ext]', font: '[name][ext]', media: '[name][ext]' },
      // What `import image from './x.png'` evaluates to at runtime. A bot passes that string
      // to fs or to a Discord attachment, so it has to be a real path on disk, which Rsbuild's
      // web-oriented default is not.
      assetPrefix,
      // Rsbuild inlines assets under 4 KB as base64 data URIs, so the same import would give a
      // path for a large file and a `data:` string for a small one. A bot reads its assets
      // with fs, where a data URI is ENOENT, so every asset is emitted as a file.
      dataUriLimit: 0,
      // Rsbuild emits no source maps in production by default, which would leave a crashed
      // bot's stack trace pointing into the bundle instead of the source.
      sourceMap: { js: mode === 'production' ? 'source-map' : 'eval-source-map' },
      // Rsbuild empties dist before building by default. MeoCord runs two builds into the same
      // directory -- the application, and meocord.config.ts into dist/meocord.config.mjs -- so
      // cleaning would let whichever runs second erase the other.
      cleanDistPath: false,
      minify: {
        // Off by default for Node targets in Rsbuild 2, so production builds would ship
        // unminified unless this is stated.
        js: mode === 'production',
        jsOptions: {
          minimizerOptions: {
            // Inversify resolves dependencies by class identity, so a mangled class name
            // breaks injection in production while development stays fine.
            mangle: { keep_classnames: true, keep_fnames: true },
            compress: { keep_classnames: true, keep_fnames: true },
          },
        },
      },
    },
    mode,
    performance: {
      // The bot is not served over a network; splitting it only makes startup resolve more files.
      chunkSplit: { strategy: 'all-in-one' },
    },
  }
}

/**
 * Refuses a MeoCord config that declares a `webpack` hook, which MeoCord does not run.
 *
 * Without this, such a config builds "successfully" with the customisation silently dropped --
 * assets landing in the wrong place, markdown imported as a path instead of its text. Refusing
 * is kinder than a green build that ships something else.
 *
 * Read as a property rather than tested with `in`: a config loaded from source comes back as
 * jiti's interop proxy, where property access reaches the default export but `in` and
 * Object.keys only see `default` -- so `'webpack' in config` is false even when it is set.
 */
export function assertNoWebpackHook(config: object | undefined): void {
  if ((config as Record<string, unknown> | undefined)?.webpack === undefined) return

  throw new Error(
    'meocord.config.ts still declares a `webpack` hook, which MeoCord no longer runs. ' +
      'Rename it to `rsbuild` and reshape its body for Rsbuild: images, fonts, svg and media ' +
      'need no rules any more, `output.filename` accepts a function for custom asset paths, ' +
      'and raw rules go through `tools.rspack`. See the 4.0.0 release notes.',
  )
}
