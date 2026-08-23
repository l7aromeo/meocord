import App from '@src/app'
import { Logger } from 'meocord/common'
import { MeoCordFactory } from 'meocord/core'

const logger = new Logger()
const app = MeoCordFactory.create(App)

async function bootstrap() {
  logger.log('Starting application')
  await app.start()
  logger.log('Application started')
}

bootstrap().catch(error => logger.error('Error during startup:', error))
