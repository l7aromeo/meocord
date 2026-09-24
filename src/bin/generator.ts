import { Argument, Command } from 'commander'
import { ControllerType } from '@src/enum/controller.enum.js'
import { ControllerGeneratorHelper } from '@src/bin/helper/controller-generator.helper.js'
import { Logger } from '@src/common/index.js'
import { ServiceGeneratorHelper } from '@src/bin/helper/service-generator.helper.js'
import { GuardGeneratorHelper } from '@src/bin/helper/guard-generator.helper.js'
import { InterceptorGeneratorHelper } from '@src/bin/helper/interceptor-generator.helper.js'
import { FilterGeneratorHelper } from '@src/bin/helper/filter-generator.helper.js'
import { PipeGeneratorHelper } from '@src/bin/helper/pipe-generator.helper.js'
import wait from '@src/util/wait.util.js'

export class GeneratorCLI {
  private logger: Logger
  private controllerGeneratorHelper: ControllerGeneratorHelper
  private serviceGeneratorHelper: ServiceGeneratorHelper
  private guardGeneratorHelper: GuardGeneratorHelper
  private interceptorGeneratorHelper: InterceptorGeneratorHelper
  private filterGeneratorHelper: FilterGeneratorHelper
  private pipeGeneratorHelper: PipeGeneratorHelper

  constructor(private appName: string) {
    this.logger = new Logger(this.appName)
    this.controllerGeneratorHelper = new ControllerGeneratorHelper()
    this.serviceGeneratorHelper = new ServiceGeneratorHelper(this.appName)
    this.guardGeneratorHelper = new GuardGeneratorHelper(this.appName)
    this.interceptorGeneratorHelper = new InterceptorGeneratorHelper(this.appName)
    this.filterGeneratorHelper = new FilterGeneratorHelper(this.appName)
    this.pipeGeneratorHelper = new PipeGeneratorHelper(this.appName)
  }

  register(program: Command): Command {
    const generatorCommand = program.command('generate').alias('g').description('Generate components')

    generatorCommand
      .command('controller')
      .alias('co')
      .description('Generate a controller component')
      .addArgument(
        // Derived from the enum rather than listed by hand, so a new controller kind
        // cannot be added to the framework and stay unreachable from the CLI.
        new Argument('<type>', 'Type of the controller (e.g., button, context-menu, etc.)').choices(
          Object.values(ControllerType),
        ),
      )
      .addArgument(new Argument('<name>', 'Name of the controller'))
      .action(async (type, name) => {
        await this.handleGenerateComponent({
          component: 'controller',
          type: type as ControllerType,
          name,
        })
      })

    generatorCommand
      .command('service')
      .alias('s')
      .addArgument(new Argument('<name>', 'Name of the service.'))
      .description('Generate a service component')
      .action(async name => {
        await this.handleGenerateComponent({
          component: 'service',
          name,
        })
      })

    generatorCommand
      .command('guard')
      .alias('gu')
      .addArgument(new Argument('<name>', 'Name of the guard.'))
      .description('Generate a guard component')
      .action(async name => {
        await this.handleGenerateComponent({
          component: 'guard',
          name,
        })
      })

    generatorCommand
      .command('interceptor')
      .alias('i')
      .addArgument(new Argument('<name>', 'Name of the interceptor.'))
      .description('Generate an interceptor component')
      .action(async name => {
        await this.handleGenerateComponent({
          component: 'interceptor',
          name,
        })
      })

    generatorCommand
      .command('filter')
      .alias('f')
      .addArgument(new Argument('<name>', 'Name of the exception filter.'))
      .description('Generate an exception filter component')
      .action(async name => {
        await this.handleGenerateComponent({
          component: 'filter',
          name,
        })
      })

    generatorCommand
      .command('pipe')
      .alias('pi')
      .addArgument(new Argument('<name>', 'Name of the pipe.'))
      .description('Generate a pipe component')
      .action(async name => {
        await this.handleGenerateComponent({
          component: 'pipe',
          name,
        })
      })

    return program
  }

  private async handleGenerateComponent(args: {
    component: string
    name: string
    type?: ControllerType
  }): Promise<void> {
    const { component, name, type } = args

    if (!name) {
      this.logger.error('Name is required')
      await wait(100)
      process.exit(1)
    }

    switch (component) {
      case 'controller':
        if (!type) {
          this.logger.error('Type is required for controllers')
          await wait(100)
          process.exit(1)
        }
        await this.handleGenerateController({ name, type })
        break

      case 'service':
        this.serviceGeneratorHelper.generateService(name)
        break

      case 'guard':
        this.guardGeneratorHelper.generateGuard(name)
        break

      case 'interceptor':
        this.interceptorGeneratorHelper.generateInterceptor(name)
        break

      case 'filter':
        this.filterGeneratorHelper.generateFilter(name)
        break

      case 'pipe':
        this.pipeGeneratorHelper.generatePipe(name)
        break

      default:
        this.logger.error(`Unsupported component type: ${component}`)
        await wait(100)
        process.exit(1)
    }
  }

  private async handleGenerateController(args: { name: string; type: ControllerType }): Promise<void> {
    try {
      this.controllerGeneratorHelper.generateController({ controllerName: args.name }, args.type)
    } catch (error) {
      this.logger.error(`Error generating controller: ${error instanceof Error ? error.message : String(error)}`)
      await wait(100)
      process.exit(1)
    }
  }
}
