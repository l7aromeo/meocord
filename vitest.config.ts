/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // SWC is required for emitDecoratorMetadata — esbuild (vite's default)
  // cannot emit decorator metadata, which inversify's DI relies on.
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      '@src': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    setupFiles: ['reflect-metadata'],
    clearMocks: true,
    // restoreMocks stays false: vitest's restoreAllMocks resets vi.fn() factory
    // implementations (jest's only restored spies), which would wipe the Logger
    // mock created in vi.mock factories. Spies are restored manually per-test
    // instead, and each test file runs in an isolated worker so spies don't leak.
    restoreMocks: false,
    include: ['src/**/*.spec.ts'],
    coverage: {
      // istanbul (not v8) — v8 coverage needs Node's inspector API, which Bun
      // doesn't implement. Istanbul instruments at transform time and works
      // under Bun, which is what CI uses to run the suite.
      provider: 'istanbul',
      // all: false — only instrument modules actually imported during the run
      // (post-SWC-transformed JS). With all: true, istanbul reads raw .ts from
      // disk and its parser chokes on TS `type` import modifiers.
      all: false,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/bin/**', 'src/**/index.ts'],
    },
  },
})
