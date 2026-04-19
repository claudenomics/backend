import { sql } from 'drizzle-orm'
import { db } from '@claudenomics/store'
import { DEFAULT_SCHEDULES } from './handlers.js'

export type ClaimedRun = {
  id: string
  kind: string
  attempts: number
}

export async function seedSchedules(): Promise<void> {
  for (const s of DEFAULT_SCHEDULES) {
    await db.execute(sql`
      INSERT INTO job_schedules (kind, interval_seconds)
      VALUES (${s.kind}, ${s.intervalSeconds})
      ON CONFLICT (kind) DO NOTHING
    `)
  }
}

export async function enqueueDueJobs(): Promise<number> {
  const result = await db.execute(sql`
    WITH due AS (
      SELECT kind, interval_seconds
      FROM job_schedules
      WHERE enabled = true
        AND next_run_at <= now()
        AND NOT EXISTS (
          SELECT 1 FROM job_runs r
          WHERE r.kind = job_schedules.kind
            AND r.status IN ('pending', 'running')
        )
      FOR UPDATE SKIP LOCKED
    ),
    inserted AS (
      INSERT INTO job_runs (id, kind, status, scheduled_at)
      SELECT gen_random_uuid(), kind, 'pending', now() FROM due
      RETURNING kind
    ),
    bumped AS (
      UPDATE job_schedules s
      SET last_run_at = now(),
          next_run_at = now() + make_interval(secs => s.interval_seconds),
          updated_at = now()
      WHERE s.kind IN (SELECT kind FROM due)
      RETURNING s.kind
    )
    SELECT count(*)::int AS n FROM bumped
  `)
  const row = (result.rows?.[0] ?? { n: 0 }) as { n: number }
  return row.n
}

export async function claimNextRun(workerId: string): Promise<ClaimedRun | null> {
  const result = await db.execute(sql`
    WITH picked AS (
      SELECT id FROM job_runs
      WHERE status = 'pending' AND scheduled_at <= now()
      ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE job_runs r
    SET status = 'running',
        started_at = now(),
        worker_id = ${workerId},
        attempts = r.attempts + 1
    FROM picked
    WHERE r.id = picked.id
    RETURNING r.id, r.kind, r.attempts
  `)
  const row = result.rows?.[0]
  if (!row) return null
  return {
    id: row.id as string,
    kind: row.kind as string,
    attempts: row.attempts as number,
  }
}

export async function completeRun(id: string, result: unknown): Promise<void> {
  await db.execute(sql`
    UPDATE job_runs
    SET status = 'succeeded',
        finished_at = now(),
        result = ${JSON.stringify(result)}::jsonb
    WHERE id = ${id}
  `)
}

export async function failRun(id: string, error: string): Promise<void> {
  await db.execute(sql`
    UPDATE job_runs
    SET status = 'failed',
        finished_at = now(),
        error = ${error}
    WHERE id = ${id}
  `)
}
