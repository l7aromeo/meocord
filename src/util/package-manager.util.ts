/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { execSync } from 'child_process'

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

const ALL_PACKAGE_MANAGERS: PackageManager[] = ['bun', 'npm', 'yarn', 'pnpm']

export function detectInstalledPMs(): PackageManager[] {
  return ALL_PACKAGE_MANAGERS.filter(pm => {
    try {
      execSync(`which ${pm}`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })
}

export function getInstallCommand(pm: PackageManager): string {
  return `${pm} install`
}
