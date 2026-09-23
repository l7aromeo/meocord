import { execSync } from 'child_process'

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

const ALL_PACKAGE_MANAGERS: PackageManager[] = ['bun', 'npm', 'yarn', 'pnpm']

/**
 * The package managers available on this machine, found by running each for its version, which
 * works without `which` (absent on Windows) and confirms the tool actually runs.
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
