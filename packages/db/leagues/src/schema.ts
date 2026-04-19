import { sql } from 'drizzle-orm'
import {
  bigint,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const leagues = pgTable('leagues', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  rank: integer('rank').notNull().unique(),
  maxPercentile: doublePrecision('max_percentile').notNull(),
  minTokens: bigint('min_tokens', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
})
