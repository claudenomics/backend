import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const jobSchedules = pgTable('job_schedules', {
  kind: text('kind').primaryKey(),
  intervalSeconds: integer('interval_seconds').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    workerId: text('worker_id'),
    error: text('error'),
    result: jsonb('result'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  t => ({
    statusSchedIdx: index('job_runs_status_scheduled_idx').on(t.status, t.scheduledAt),
    kindStatusIdx: index('job_runs_kind_status_idx').on(t.kind, t.status),
  }),
)
