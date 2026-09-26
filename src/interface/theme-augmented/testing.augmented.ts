// Reads the augmentation theme.augmented.ts declares (vip, charts), so it belongs to that file's program
import { createMockTheme, MeoCordTestingModule, withTheme } from '@src/testing/index.js'

/** The testing helpers under theme.augmented.ts's tokens: the app's own must be given, as at the root. */

createMockTheme({ colors: { vip: '#FFD700' }, charts: { axis: 0, series: [] } })
// @ts-expect-error the app's own tokens have no default, so a mock theme without them would lack them
createMockTheme()
// @ts-expect-error nor may a part of them be left out
createMockTheme({ colors: { vip: '#FFD700' } })

withTheme(createMockTheme({ colors: { vip: 0 }, charts: { axis: 0, series: [] } }), () => undefined)
withTheme({ colors: { vip: 0 }, charts: { axis: 0, series: [] } }, () => undefined)
// @ts-expect-error as for createMockTheme
withTheme({ colors: { primary: 0 } }, () => undefined)

MeoCordTestingModule.create({ controllers: [] }).overrideTheme({ colors: { vip: '#C0C0C0' }, charts: { axis: 0, series: [] } })
// @ts-expect-error it replaces the app's theme, so it gives what the app's must
MeoCordTestingModule.create({ controllers: [] }).overrideTheme({ colors: { primary: '#C0C0C0' } })
