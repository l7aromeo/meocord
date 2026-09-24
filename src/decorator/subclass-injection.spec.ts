import { ButtonInteraction } from 'discord.js'
import { Command, Controller, Guard, Service, UseGuard } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { type GuardInterface } from '@src/interface/index.js'
import { createMockInteraction, MeoCordTestingModule } from '@src/testing/index.js'

@Service()
class ProfileService {}

@Service()
class AuditService {}

@Controller()
class BaseProfileController {
  constructor(readonly profiles: ProfileService) {}
}

@Controller()
class InheritedConstructorController extends BaseProfileController {}

@Controller()
class OwnConstructorController extends BaseProfileController {
  constructor(
    profiles: ProfileService,
    readonly audit: AuditService,
  ) {
    super(profiles)
  }
}

@Service()
class ExtendedProfileService extends ProfileService {
  constructor(readonly audit: AuditService) {
    super()
  }
}

const checks: boolean[] = []

@Guard()
class BaseGuard implements GuardInterface {
  constructor(readonly profiles: ProfileService) {}

  canActivate() {
    return true
  }
}

@Guard()
class AuditingGuard extends BaseGuard {
  constructor(
    profiles: ProfileService,
    readonly audit: AuditService,
  ) {
    super(profiles)
  }

  canActivate() {
    checks.push(this.audit instanceof AuditService && this.profiles instanceof ProfileService)
    return true
  }
}

@Controller()
class AuditedController {
  @Command('audited', CommandType.BUTTON)
  @UseGuard(AuditingGuard)
  async audited(_interaction: ButtonInteraction) {}
}

describe('a subclass of a decorated class', () => {
  it('resolves a controller that inherits its constructor', () => {
    const module = MeoCordTestingModule.create({ controllers: [InheritedConstructorController] }).compile()
    expect(module.get(InheritedConstructorController).profiles).toBeInstanceOf(ProfileService)
  })

  it('resolves a controller whose own constructor takes more dependencies', () => {
    const controller = MeoCordTestingModule.create({ controllers: [OwnConstructorController] })
      .compile()
      .get(OwnConstructorController)

    expect(controller.profiles).toBeInstanceOf(ProfileService)
    expect(controller.audit).toBeInstanceOf(AuditService)
  })

  it('resolves a service whose own constructor takes dependencies', () => {
    const module = MeoCordTestingModule.create({
      providers: [
        { provide: AuditService, useClass: AuditService },
        { provide: ExtendedProfileService, useClass: ExtendedProfileService },
      ],
    }).compile()

    expect(module.get(ExtendedProfileService).audit).toBeInstanceOf(AuditService)
  })

  it('resolves a guard whose own constructor takes dependencies', async () => {
    const module = MeoCordTestingModule.create({ controllers: [AuditedController] }).compile()

    await module.invoke(AuditedController, 'audited', createMockInteraction(ButtonInteraction))

    expect(checks).toEqual([true])
  })
})
