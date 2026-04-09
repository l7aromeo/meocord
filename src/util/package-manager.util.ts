/**
 * MeoCord Framework
 * Copyright (C) 2025 Ukasyah Rahmatullah Zada
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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
