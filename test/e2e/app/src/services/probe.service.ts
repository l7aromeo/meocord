import { type Client } from 'discord.js'
import { ShardContext } from 'meocord/core'
import { Service } from 'meocord/decorator'
import { type OnReady, type OnShutdown, type ReadyInfo } from 'meocord/interface'
import { ClockService } from '@src/services/clock.service'
import { report } from '@src/report'

@Service()
export class ProbeService implements OnReady, OnShutdown {
  constructor(
    private readonly clock: ClockService,
    private readonly shards: ShardContext,
  ) {}

  onReady(client: Client<true>, { primary }: ReadyInfo) {
    report('ready', { cls: ProbeService.name, primary, shards: this.shards.ids, user: client.user.id, at: this.clock.now() })
    // The last shard starts after the others are ready, so from there a call reaches every process
    if (this.shards.ids.includes(this.shards.count - 1)) void this.callEveryShard()
  }

  onShutdown() {
    report('shutdown', { cls: ProbeService.name })
  }

  shardIds(): number[] {
    return this.shards.ids
  }

  private async callEveryShard() {
    const results = await this.shards.call(ProbeService, 'shardIds')
    report('shard-call', { results: results.map(result => (result.ok ? result.value : `error: ${String(result.error)}`)) })
  }
}
