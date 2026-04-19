import { reqLogger } from '@claudenomics/auth'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { handlers } from './handlers.js'
import { claimNextRun, completeRun, enqueueDueJobs, failRun, seedSchedules } from './queries.js'

const log = reqLogger('jobs')

type WorkerState = {
  running: boolean
  timer: NodeJS.Timeout | null
  workerId: string
}

const state: WorkerState = {
  running: false,
  timer: null,
  workerId: `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`,
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function startWorker(): void {
  if (state.running) return
  state.running = true
  const tickMs = positiveIntEnv('JOBS_TICK_MS', 15_000)
  log.info({ event: 'jobs_worker_start', workerId: state.workerId, tickMs })

  const tick = async () => {
    try {
      await seedSchedules()
      await enqueueDueJobs()
      await drainPending()
    } catch (err) {
      log.error({ event: 'jobs_tick_error', err })
    } finally {
      if (state.running) state.timer = setTimeout(tick, tickMs)
    }
  }
  void tick()
}

export function stopWorker(): void {
  state.running = false
  if (state.timer) clearTimeout(state.timer)
  state.timer = null
}

async function drainPending(): Promise<void> {
  for (let i = 0; i < 32; i++) {
    const claimed = await claimNextRun(state.workerId)
    if (!claimed) return
    const handler = handlers[claimed.kind]
    if (!handler) {
      await failRun(claimed.id, `no handler for kind '${claimed.kind}'`)
      log.warn({ event: 'jobs_missing_handler', kind: claimed.kind, runId: claimed.id })
      continue
    }
    const started = Date.now()
    try {
      const result = await handler()
      await completeRun(claimed.id, result)
      log.info({
        event: 'jobs_run_succeeded',
        kind: claimed.kind,
        runId: claimed.id,
        durationMs: Date.now() - started,
        result,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await failRun(claimed.id, message)
      log.error({
        event: 'jobs_run_failed',
        kind: claimed.kind,
        runId: claimed.id,
        durationMs: Date.now() - started,
        err,
      })
    }
  }
}
