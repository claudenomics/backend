import { sql } from 'drizzle-orm'
import { bigint, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const leagues = pgTable('leagues', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  rank: integer('rank').notNull().unique(),
  thresholdTokens: bigint('threshold_tokens', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
})
