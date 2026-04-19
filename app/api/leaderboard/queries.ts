import { and, asc, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm'
import { db, receipts } from '@claudenomics/store'
import { squadSocials, squads } from '@claudenomics/squads/schema'
import { socialAccounts, users } from '@claudenomics/users/schema'

export interface BuilderRankingRow {
  wallet: string
  inputTokens: number
  outputTokens: number
  receiptCount: number
}

export interface SquadRankingRow {
  squadId: string
  inputTokens: number
  outputTokens: number
  receiptCount: number
}

export interface RankingParams {
  since?: number
  leagueId?: string
  searchLike?: string
  page: number
  pageSize: number
}

const burnExpr = sql<string>`SUM(${receipts.inputTokens} + ${receipts.outputTokens})`

export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&')
}

function builderConditions(p: RankingParams): SQL | undefined {
  const parts: SQL[] = []
  if (p.since !== undefined) parts.push(gte(receipts.ts, p.since))
  if (p.leagueId) parts.push(eq(users.currentLeagueId, p.leagueId))
  if (p.searchLike) {
    parts.push(
      sql`(${users.handle} ILIKE ${p.searchLike} OR COALESCE(${users.displayName}, '') ILIKE ${p.searchLike})`,
    )
  }
  return parts.length > 0 ? and(...parts) : undefined
}

function squadConditions(p: RankingParams): SQL | undefined {
  const parts: SQL[] = []
  if (p.since !== undefined) parts.push(gte(receipts.ts, p.since))
  if (p.leagueId) parts.push(eq(squads.currentLeagueId, p.leagueId))
  if (p.searchLike) {
    parts.push(sql`(${squads.slug} ILIKE ${p.searchLike} OR ${squads.name} ILIKE ${p.searchLike})`)
  }
  return parts.length > 0 ? and(...parts) : undefined
}

export async function rankBuilders(
  p: RankingParams,
): Promise<{ rows: BuilderRankingRow[]; total: number }> {
  const whereExpr = builderConditions(p)

  const rows = await db
    .select({
      wallet: receipts.wallet,
      inputTokens: sql<string>`COALESCE(SUM(${receipts.inputTokens}), 0)`,
      outputTokens: sql<string>`COALESCE(SUM(${receipts.outputTokens}), 0)`,
      receiptCount: sql<string>`COUNT(*)`,
    })
    .from(receipts)
    .innerJoin(users, eq(users.wallet, receipts.wallet))
    .where(whereExpr)
    .groupBy(receipts.wallet)
    .orderBy(desc(burnExpr), asc(receipts.wallet))
    .limit(p.pageSize)
    .offset((p.page - 1) * p.pageSize)

  const [countRow] = await db
    .select({ count: sql<string>`COUNT(DISTINCT ${receipts.wallet})` })
    .from(receipts)
    .innerJoin(users, eq(users.wallet, receipts.wallet))
    .where(whereExpr)

  return {
    rows: rows.map(r => ({
      wallet: r.wallet,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      receiptCount: Number(r.receiptCount),
    })),
    total: Number(countRow?.count ?? 0),
  }
}

export async function rankSquads(
  p: RankingParams,
): Promise<{ rows: SquadRankingRow[]; total: number }> {
  const whereExpr = squadConditions(p)

  const rows = await db
    .select({
      squadId: squads.id,
      inputTokens: sql<string>`COALESCE(SUM(${receipts.inputTokens}), 0)`,
      outputTokens: sql<string>`COALESCE(SUM(${receipts.outputTokens}), 0)`,
      receiptCount: sql<string>`COUNT(*)`,
    })
    .from(receipts)
    .innerJoin(squads, eq(squads.id, receipts.attributedSquadId))
    .where(whereExpr)
    .groupBy(squads.id)
    .orderBy(desc(burnExpr), asc(squads.id))
    .limit(p.pageSize)
    .offset((p.page - 1) * p.pageSize)

  const [countRow] = await db
    .select({ count: sql<string>`COUNT(DISTINCT ${squads.id})` })
    .from(receipts)
    .innerJoin(squads, eq(squads.id, receipts.attributedSquadId))
    .where(whereExpr)

  return {
    rows: rows.map(r => ({
      squadId: r.squadId,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      receiptCount: Number(r.receiptCount),
    })),
    total: Number(countRow?.count ?? 0),
  }
}

export async function topModelForWallets(
  wallets: string[],
  since?: number,
): Promise<Map<string, string>> {
  if (wallets.length === 0) return new Map()
  const conditions = [inArray(receipts.wallet, wallets)]
  if (since !== undefined) conditions.push(gte(receipts.ts, since))
  const rows = await db
    .select({
      wallet: receipts.wallet,
      model: receipts.model,
      burn: burnExpr,
    })
    .from(receipts)
    .where(and(...conditions))
    .groupBy(receipts.wallet, receipts.model)
    .orderBy(asc(receipts.wallet), desc(burnExpr))
  const map = new Map<string, string>()
  for (const row of rows) if (!map.has(row.wallet)) map.set(row.wallet, row.model)
  return map
}

export async function topModelForSquads(
  squadIds: string[],
  since?: number,
): Promise<Map<string, string>> {
  if (squadIds.length === 0) return new Map()
  const conditions = [inArray(receipts.attributedSquadId, squadIds)]
  if (since !== undefined) conditions.push(gte(receipts.ts, since))
  const rows = await db
    .select({
      squadId: receipts.attributedSquadId,
      model: receipts.model,
      burn: burnExpr,
    })
    .from(receipts)
    .where(and(...conditions))
    .groupBy(receipts.attributedSquadId, receipts.model)
    .orderBy(asc(receipts.attributedSquadId), desc(burnExpr))
  const map = new Map<string, string>()
  for (const row of rows) {
    if (row.squadId && !map.has(row.squadId)) map.set(row.squadId, row.model)
  }
  return map
}

export async function providersForWallets(
  wallets: string[],
  since?: number,
): Promise<Map<string, string[]>> {
  if (wallets.length === 0) return new Map()
  const conditions = [inArray(receipts.wallet, wallets)]
  if (since !== undefined) conditions.push(gte(receipts.ts, since))
  const rows = await db
    .select({ wallet: receipts.wallet, upstream: receipts.upstream })
    .from(receipts)
    .where(and(...conditions))
    .groupBy(receipts.wallet, receipts.upstream)
    .orderBy(asc(receipts.wallet), asc(receipts.upstream))
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const list = map.get(row.wallet) ?? []
    list.push(row.upstream)
    map.set(row.wallet, list)
  }
  return map
}

export async function providersForSquads(
  squadIds: string[],
  since?: number,
): Promise<Map<string, string[]>> {
  if (squadIds.length === 0) return new Map()
  const conditions = [inArray(receipts.attributedSquadId, squadIds)]
  if (since !== undefined) conditions.push(gte(receipts.ts, since))
  const rows = await db
    .select({ squadId: receipts.attributedSquadId, upstream: receipts.upstream })
    .from(receipts)
    .where(and(...conditions))
    .groupBy(receipts.attributedSquadId, receipts.upstream)
    .orderBy(asc(receipts.attributedSquadId), asc(receipts.upstream))
  const map = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.squadId) continue
    const list = map.get(row.squadId) ?? []
    list.push(row.upstream)
    map.set(row.squadId, list)
  }
  return map
}

export async function verifiedUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await db
    .select({ userId: socialAccounts.userId })
    .from(socialAccounts)
    .where(and(inArray(socialAccounts.userId, userIds), eq(socialAccounts.provider, 'x')))
  return new Set(rows.map(r => r.userId))
}

export async function verifiedSquadIds(squadIds: string[]): Promise<Set<string>> {
  if (squadIds.length === 0) return new Set()
  const rows = await db
    .select({ squadId: squadSocials.squadId })
    .from(squadSocials)
    .where(and(inArray(squadSocials.squadId, squadIds), eq(squadSocials.provider, 'x')))
  return new Set(rows.map(r => r.squadId))
}
