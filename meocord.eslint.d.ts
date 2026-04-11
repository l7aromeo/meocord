/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import type { Linter } from 'eslint'

/**
 * Pre-configured TypeScript ESLint config for MeoCord projects.
 */
export declare const typescriptConfig: Linter.Config

/**
 * Default MeoCord ESLint configuration.
 * Extends this array in your eslint.config.ts to use MeoCord's recommended settings.
 */
declare const config: Linter.Config[]

export default config
