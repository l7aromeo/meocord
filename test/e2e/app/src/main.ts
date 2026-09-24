import App from '@src/app'
import { Logger } from 'meocord/common'
import { MeoCordFactory } from 'meocord/core'
import { report } from '@src/report'

const logger = new Logger()

// Every process reports itself, the shard manager and each shard alike, so the runner can check none is left behind
report('process')

MeoCordFactory.create(App)
  .start()
  .catch(error => logger.error('Error during startup:', error))
