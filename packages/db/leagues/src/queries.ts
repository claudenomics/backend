import { asc, eq, gt, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
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

export const DEFAULT_LEAGUES = [
  { slug: 'bronze', name: 'Bronze', rank: 1, maxPercentile: 1.0, minTokens: 1_000_000 },
  { slug: 'silver', name: 'Silver', rank: 2, maxPercentile: 0.5, minTokens: 20_000_000 },
  { slug: 'gold', name: 'Gold', rank: 3, maxPercentile: 0.25, minTokens: 200_000_000 },
  { slug: 'platinum', name: 'Platinum', rank: 4, maxPercentile: 0.1, minTokens: 1_000_000_000 },
  { slug: 'diamond', name: 'Diamond', rank: 5, maxPercentile: 0.03, minTokens: 5_000_000_000 },
  { slug: 'master', name: 'Master', rank: 6, maxPercentile: 0.005, minTokens: 20_000_000_000 },
] as const

export async function seedLeagues(): Promise<void> {
  for (const l of DEFAULT_LEAGUES) {
    await db
      .insert(leagues)
      .values({
        id: randomUUID(),
        slug: l.slug,
        name: l.name,
        rank: l.rank,
        maxPercentile: l.maxPercentile,
        minTokens: l.minTokens,
      })
      .onConflictDoUpdate({
        target: leagues.slug,
        set: {
          name: l.name,
          rank: l.rank,
          maxPercentile: l.maxPercentile,
          minTokens: l.minTokens,
        },
      })
  }
}

export async function recomputeUserLeagues(): Promise<number> {
  const result = await db.execute(sql`
    WITH totals AS (
      SELECT u.id AS user_id,
             COALESCE(wt.input_tokens + wt.output_tokens, 0) AS tokens
      FROM users u
      LEFT JOIN wallet_totals wt ON wt.wallet = u.wallet
    ),
    ranked AS (
      SELECT user_id, tokens,
             PERCENT_RANK() OVER (ORDER BY tokens DESC) AS pct
      FROM totals
    ),
    assignments AS (
      SELECT DISTINCT ON (r.user_id) r.user_id, l.id AS league_id
      FROM ranked r
      LEFT JOIN leagues l
        ON r.pct <= l.max_percentile
       AND r.tokens >= l.min_tokens
      ORDER BY r.user_id, l.rank DESC NULLS LAST
    ),
    updated AS (
      UPDATE users u
      SET current_league_id = a.league_id, updated_at = now()
      FROM assignments a
      WHERE u.id = a.user_id
        AND u.current_league_id IS DISTINCT FROM a.league_id
      RETURNING u.id
    )
    SELECT count(*)::int AS changed FROM updated
  `)
  const row = (result.rows?.[0] ?? { changed: 0 }) as { changed: number }
  return row.changed
}

export async function recomputeSquadLeagues(): Promise<number> {
  const result = await db.execute(sql`
    WITH totals AS (
      SELECT s.id AS squad_id,
             COALESCE(SUM(r.input_tokens + r.output_tokens), 0) AS tokens
      FROM squads s
      LEFT JOIN receipts r ON r.attributed_squad_id = s.id
      GROUP BY s.id
    ),
    ranked AS (
      SELECT squad_id, tokens,
             PERCENT_RANK() OVER (ORDER BY tokens DESC) AS pct
      FROM totals
    ),
    assignments AS (
      SELECT DISTINCT ON (r.squad_id) r.squad_id, l.id AS league_id
      FROM ranked r
      LEFT JOIN leagues l
        ON r.pct <= l.max_percentile
       AND r.tokens >= l.min_tokens
      ORDER BY r.squad_id, l.rank DESC NULLS LAST
    ),
    updated AS (
      UPDATE squads s
      SET current_league_id = a.league_id, updated_at = now()
      FROM assignments a
      WHERE s.id = a.squad_id
        AND s.current_league_id IS DISTINCT FROM a.league_id
      RETURNING s.id
    )
    SELECT count(*)::int AS changed FROM updated
  `)
  const row = (result.rows?.[0] ?? { changed: 0 }) as { changed: number }
  return row.changed
}

export async function recomputeAllLeagues(): Promise<{ users: number; squads: number }> {
  await seedLeagues()
  const users = await recomputeUserLeagues()
  const squads = await recomputeSquadLeagues()
  return { users, squads }
}

export type LeagueProgress = {
  currentTokens: number
  nextSlug: string | null
  nextRank: number | null
  requiredTokens: number | null
  tokensToNext: number | null
}

export async function getLeagueProgress(
  userTokens: number,
  currentLeagueId: string | null,
): Promise<LeagueProgress> {
  let currentRank = 0
  if (currentLeagueId) {
    const [cur] = await db
      .select({ rank: leagues.rank })
      .from(leagues)
      .where(eq(leagues.id, currentLeagueId))
      .limit(1)
    currentRank = cur?.rank ?? 0
  }

  const [nextTier] = await db
    .select()
    .from(leagues)
    .where(gt(leagues.rank, currentRank))
    .orderBy(asc(leagues.rank))
    .limit(1)

  if (!nextTier) {
    return {
      currentTokens: userTokens,
      nextSlug: null,
      nextRank: null,
      requiredTokens: null,
      tokensToNext: null,
    }
  }

  // percentile_cont has no drizzle builder helper; and this package can't
  // import the users table without creating a dep cycle (users depends on
  // leagues). So this one scalar stays raw.
  const cutoffResult = await db.execute(sql`
    SELECT percentile_cont(${nextTier.maxPercentile})
             WITHIN GROUP (ORDER BY COALESCE(wt.input_tokens + wt.output_tokens, 0) DESC) AS cut
    FROM users u LEFT JOIN wallet_totals wt ON wt.wallet = u.wallet
  `)
  const cutoffRaw = (cutoffResult.rows?.[0] as { cut: unknown } | undefined)?.cut
  const cutoff = cutoffRaw == null ? 0 : Math.round(Number(cutoffRaw))

  const requiredTokens = Math.max(nextTier.minTokens, cutoff)
  const tokensToNext = Math.max(0, requiredTokens - userTokens)

  return {
    currentTokens: userTokens,
    nextSlug: nextTier.slug,
    nextRank: nextTier.rank,
    requiredTokens,
    tokensToNext,
  }
}
