import { and, asc, eq, inArray, lte, notExists, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '@claudenomics/store'
import { DEFAULT_SCHEDULES } from './handlers.js'
import { jobRuns, jobSchedules } from './schema.js'

export type ClaimedRun = {
  id: string
  kind: string
  attempts: number
}

export async function seedSchedules(): Promise<void> {
  for (const s of DEFAULT_SCHEDULES) {
    await db
      .insert(jobSchedules)
      .values({ kind: s.kind, intervalSeconds: s.intervalSeconds })
      .onConflictDoNothing({ target: jobSchedules.kind })
  }
}

export async function enqueueDueJobs(): Promise<number> {
  return db.transaction(async tx => {
    const due = await tx
      .select({ kind: jobSchedules.kind })
      .from(jobSchedules)
      .where(
        and(
          eq(jobSchedules.enabled, true),
          lte(jobSchedules.nextRunAt, sql`now()`),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(jobRuns)
              .where(
                and(
                  eq(jobRuns.kind, jobSchedules.kind),
                  inArray(jobRuns.status, ['pending', 'running']),
                ),
              ),
          ),
        ),
      )
      .for('update', { skipLocked: true })

    if (due.length === 0) return 0

    const now = new Date()
    await tx.insert(jobRuns).values(
      due.map(d => ({
        id: randomUUID(),
        kind: d.kind,
        status: 'pending',
        scheduledAt: now,
      })),
    )

    await tx
      .update(jobSchedules)
      .set({
        lastRunAt: now,
        nextRunAt: sql`now() + make_interval(secs => ${jobSchedules.intervalSeconds})`,
        updatedAt: now,
      })
      .where(
        inArray(
          jobSchedules.kind,
          due.map(d => d.kind),
        ),
      )

    return due.length
  })
}

export async function claimNextRun(workerId: string): Promise<ClaimedRun | null> {
  return db.transaction(async tx => {
    const [picked] = await tx
      .select({ id: jobRuns.id, kind: jobRuns.kind, attempts: jobRuns.attempts })
      .from(jobRuns)
      .where(and(eq(jobRuns.status, 'pending'), lte(jobRuns.scheduledAt, sql`now()`)))
      .orderBy(asc(jobRuns.scheduledAt))
      .limit(1)
      .for('update', { skipLocked: true })

    if (!picked) return null

    const nextAttempts = picked.attempts + 1
    await tx
      .update(jobRuns)
      .set({
        status: 'running',
        startedAt: new Date(),
        workerId,
        attempts: nextAttempts,
      })
      .where(eq(jobRuns.id, picked.id))

    return { id: picked.id, kind: picked.kind, attempts: nextAttempts }
  })
}

export async function completeRun(id: string, result: unknown): Promise<void> {
  await db
    .update(jobRuns)
    .set({
      status: 'succeeded',
      finishedAt: new Date(),
      result: result as Record<string, unknown>,
    })
    .where(eq(jobRuns.id, id))
}

export async function failRun(id: string, error: string): Promise<void> {
  await db
    .update(jobRuns)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      error,
    })
    .where(eq(jobRuns.id, id))
}
