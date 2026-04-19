import { asc, eq } from 'drizzle-orm'
import { db } from '@claudenomics/store'
import { leagues } from './schema.js'
import type { LeagueRow } from './types.js'

export async function getLeagueById(id: string): Promise<LeagueRow | null> {
  const [row] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return row ?? null
}

export async function getLeagueBySlug(slug: string): Promise<LeagueRow | null> {
  const [row] = await db.select().from(leagues).where(eq(leagues.slug, slug)).limit(1)
  return row ?? null
}

export async function listLeagues(): Promise<LeagueRow[]> {
  return db.select().from(leagues).orderBy(asc(leagues.rank))
}
