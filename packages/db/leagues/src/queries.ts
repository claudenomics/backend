import { asc, eq, sql } from 'drizzle-orm'
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

// Raw SQL because percentile_cont + nested CTE scalar lookups don't have
// clean drizzle-builder equivalents. Returns the next-tier token cutoff
// (max of its percentile cutoff and its min_tokens floor) plus the user's
// current total.
export async function getLeagueProgress(userId: string): Promise<LeagueProgress> {
  const result = await db.execute(sql`
    WITH totals AS (
      SELECT u.id AS user_id,
             COALESCE(wt.input_tokens + wt.output_tokens, 0) AS tokens
      FROM users u
      LEFT JOIN wallet_totals wt ON wt.wallet = u.wallet
    ),
    me AS (SELECT tokens FROM totals WHERE user_id = ${userId}),
    cur_rank AS (
      SELECT COALESCE(l.rank, 0) AS rank
      FROM users u
      LEFT JOIN leagues l ON l.id = u.current_league_id
      WHERE u.id = ${userId}
    ),
    next_tier AS (
      SELECT slug, rank, max_percentile, min_tokens
      FROM leagues
      WHERE rank > (SELECT rank FROM cur_rank)
      ORDER BY rank ASC
      LIMIT 1
    ),
    cutoff AS (
      SELECT percentile_cont((SELECT max_percentile FROM next_tier))
               WITHIN GROUP (ORDER BY tokens DESC) AS cut
      FROM totals
      WHERE (SELECT max_percentile FROM next_tier) IS NOT NULL
    )
    SELECT
      COALESCE((SELECT tokens FROM me), 0)::bigint AS current_tokens,
      (SELECT slug FROM next_tier) AS next_slug,
      (SELECT rank FROM next_tier) AS next_rank,
      CASE
        WHEN (SELECT slug FROM next_tier) IS NULL THEN NULL
        ELSE GREATEST(
          (SELECT min_tokens FROM next_tier),
          COALESCE((SELECT cut FROM cutoff)::bigint, 0)
        )::bigint
      END AS required_tokens
  `)
  const row = result.rows?.[0] as
    | { current_tokens: string | number; next_slug: string | null; next_rank: number | null; required_tokens: string | number | null }
    | undefined
  if (!row) {
    return { currentTokens: 0, nextSlug: null, nextRank: null, requiredTokens: null, tokensToNext: null }
  }
  const currentTokens = Number(row.current_tokens) || 0
  const requiredTokens = row.required_tokens == null ? null : Number(row.required_tokens)
  const tokensToNext =
    requiredTokens == null ? null : Math.max(0, requiredTokens - currentTokens)
  return {
    currentTokens,
    nextSlug: row.next_slug,
    nextRank: row.next_rank,
    requiredTokens,
    tokensToNext,
  }
}
