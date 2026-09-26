import { describe, expectTypeOf, it } from 'vitest'
import { type ReservedThemeRole } from '@src/interface/index.js'
import { RESERVED_THEME_ROLES } from '@src/core/theme-validation.js'

/** Runs under `vitest --typecheck`. */

describe('RESERVED_THEME_ROLES', () => {
  // The runtime list checks JavaScript apps; the type checks TypeScript ones: they must name the same roles
  it('names exactly the roles ReservedThemeRole does', () => {
    expectTypeOf<(typeof RESERVED_THEME_ROLES)[number]>().toEqualTypeOf<ReservedThemeRole>()
  })
})
