/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { execSync } from 'child_process'

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

const ALL_PACKAGE_MANAGERS: PackageManager[] = ['bun', 'npm', 'yarn', 'pnpm']

/**
 * The package managers available on this machine.
 *
 * Each candidate is asked for its version rather than looked up with `which`: `which` is
 * a separate binary that a minimal image need not carry, and it is absent on Windows
 * entirely. Running the tool also answers the question actually being asked — whether it
 * works — rather than whether something with that name sits on the path.
 */
export function detectInstalledPMs(): PackageManager[] {
  return ALL_PACKAGE_MANAGERS.filter(pm => {
    try {
      execSync(`${pm} --version`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })
}

export function getInstallCommand(pm: PackageManager): string {
  return `${pm} install`
}
