/** Writes one line for scripts/e2e.ts, which reads what the bot did from its output. */
export function report(event: string, data: Record<string, unknown> = {}): void {
  console.log(`E2E ${JSON.stringify({ event, pid: process.pid, ...data })}`)
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
