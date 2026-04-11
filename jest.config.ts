/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

/** @type {import('jest').Config} */
const config = {
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: false,
            decorators: true,
          },
          transform: {
            decoratorMetadata: true,
            legacyDecorator: true,
          },
          target: 'es2022',
        },
        module: {
          type: 'es6',
          noInterop: false,
        },
        sourceMaps: 'inline',
      },
    ],
  },
  moduleNameMapper: {
    '^@src/(.+)\\.js$': '<rootDir>/src/$1.ts',
    '^@src/(.+)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(' +
      'lodash-es|' +
      'chalk|' +
      '@clack/prompts|' +
      '@clack/core|' +
      'inversify|' +
      '@inversifyjs/common|' +
      '@inversifyjs/container|' +
      '@inversifyjs/core|' +
      '@inversifyjs/plugin|' +
      '@inversifyjs/prototype-utils|' +
      '@inversifyjs/reflect-metadata-utils' +
      '))',
  ],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  setupFiles: ['reflect-metadata'],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/bin/**', '!src/**/index.ts'],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
}

export default config
