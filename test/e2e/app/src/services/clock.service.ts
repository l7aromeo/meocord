import { Service } from 'meocord/decorator'
import { type OnReady, type OnShutdown } from 'meocord/interface'
import { report } from '@src/report'

/** A dependency of ProbeService, so the hooks have an order to keep: ready first, shut down last. */
@Service()
export class ClockService implements OnReady, OnShutdown {
  onReady() {
    report('ready', { cls: ClockService.name })
  }

  onShutdown() {
    report('shutdown', { cls: ClockService.name })
  }

  now() {
    return Date.now()
  }
}
