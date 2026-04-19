import type { leagues } from './schema.js'

export type LeagueRow = typeof leagues.$inferSelect
export type NewLeague = typeof leagues.$inferInsert
