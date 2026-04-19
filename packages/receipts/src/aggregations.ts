import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db, receipts } from '@claudenomics/store'

export const SESSION_GAP_MS = 15 * 60 * 1000
export const SESSION_FLOOR_MS = 60 * 1000

export interface TokenTotals {
  inputTokens: number
  outputTokens: number
  receiptCount: number
}

export interface TokenBreakdown {
  key: string
  inputTokens: number
  outputTokens: number
  receiptCount: number
}

const EMPTY_TOTALS: TokenTotals = { inputTokens: 0, outputTokens: 0, receiptCount: 0 }

function receiptsWhere(wallets: string[], since?: number) {
  if (since === undefined) return inArray(receipts.wallet, wallets)
  return and(inArray(receipts.wallet, wallets), gte(receipts.ts, since))
}

export async function sumTokensByWallets(
  wallets: string[],
  since?: number,
): Promise<TokenTotals> {
  if (wallets.length === 0) return EMPTY_TOTALS
  const [row] = await db
    .select({
      inputTokens: sql<string>`COALESCE(SUM(${receipts.inputTokens}), 0)`,
      outputTokens: sql<string>`COALESCE(SUM(${receipts.outputTokens}), 0)`,
      receiptCount: sql<string>`COUNT(*)`,
    })
    .from(receipts)
    .where(receiptsWhere(wallets, since))
  return {
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    receiptCount: Number(row?.receiptCount ?? 0),
  }
}

export async function modelBreakdownByWallets(
  wallets: string[],
  since?: number,
): Promise<TokenBreakdown[]> {
  if (wallets.length === 0) return []
  const rows = await db
    .select({
      key: receipts.model,
      inputTokens: sql<string>`COALESCE(SUM(${receipts.inputTokens}), 0)`,
      outputTokens: sql<string>`COALESCE(SUM(${receipts.outputTokens}), 0)`,
      receiptCount: sql<string>`COUNT(*)`,
    })
    .from(receipts)
    .where(receiptsWhere(wallets, since))
    .groupBy(receipts.model)
    .orderBy(sql`SUM(${receipts.inputTokens} + ${receipts.outputTokens}) DESC`)
  return rows.map(r => ({
    key: r.key,
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    receiptCount: Number(r.receiptCount),
  }))
}

export async function providerBreakdownByWallets(
  wallets: string[],
  since?: number,
): Promise<TokenBreakdown[]> {
  if (wallets.length === 0) return []
  const rows = await db
    .select({
      key: receipts.upstream,
      inputTokens: sql<string>`COALESCE(SUM(${receipts.inputTokens}), 0)`,
      outputTokens: sql<string>`COALESCE(SUM(${receipts.outputTokens}), 0)`,
      receiptCount: sql<string>`COUNT(*)`,
    })
    .from(receipts)
    .where(receiptsWhere(wallets, since))
    .groupBy(receipts.upstream)
    .orderBy(sql`SUM(${receipts.inputTokens} + ${receipts.outputTokens}) DESC`)
  return rows.map(r => ({
    key: r.key,
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    receiptCount: Number(r.receiptCount),
  }))
}

function receiptsBySquadWhere(squadId: string, since?: number) {
  if (since === undefined) return eq(receipts.attributedSquadId, squadId)
  return and(eq(receipts.attributedSquadId, squadId), gte(receipts.ts, since))
}

export async function sumTokensBySquad(
  squadId: string,
  since?: number,
): Promise<TokenTotals> {
  const [row] = await db
    .select({
      inputTokens: sql<string>`COALESCE(SUM(${receipts.inputTokens}), 0)`,
      outputTokens: sql<string>`COALESCE(SUM(${receipts.outputTokens}), 0)`,
      receiptCount: sql<string>`COUNT(*)`,
    })
    .from(receipts)
    .where(receiptsBySquadWhere(squadId, since))
  return {
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    receiptCount: Number(row?.receiptCount ?? 0),
  }
}

export async function modelBreakdownBySquad(
  squadId: string,
  since?: number,
): Promise<TokenBreakdown[]> {
  const rows = await db
    .select({
      key: receipts.model,
      inputTokens: sql<string>`COALESCE(SUM(${receipts.inputTokens}), 0)`,
      outputTokens: sql<string>`COALESCE(SUM(${receipts.outputTokens}), 0)`,
      receiptCount: sql<string>`COUNT(*)`,
    })
    .from(receipts)
    .where(receiptsBySquadWhere(squadId, since))
    .groupBy(receipts.model)
    .orderBy(sql`SUM(${receipts.inputTokens} + ${receipts.outputTokens}) DESC`)
  return rows.map(r => ({
    key: r.key,
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    receiptCount: Number(r.receiptCount),
  }))
}

export async function providerBreakdownBySquad(
  squadId: string,
  since?: number,
): Promise<TokenBreakdown[]> {
  const rows = await db
    .select({
      key: receipts.upstream,
      inputTokens: sql<string>`COALESCE(SUM(${receipts.inputTokens}), 0)`,
      outputTokens: sql<string>`COALESCE(SUM(${receipts.outputTokens}), 0)`,
      receiptCount: sql<string>`COUNT(*)`,
    })
    .from(receipts)
    .where(receiptsBySquadWhere(squadId, since))
    .groupBy(receipts.upstream)
    .orderBy(sql`SUM(${receipts.inputTokens} + ${receipts.outputTokens}) DESC`)
  return rows.map(r => ({
    key: r.key,
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    receiptCount: Number(r.receiptCount),
  }))
}

function clusterSessionMs(
  rows: Array<{ key: string; ts: number }>,
  gapMs: number,
  floorMs: number,
): Map<string, number> {
  const result = new Map<string, number>()
  let curKey: string | null = null
  let sessStart = 0
  let sessEnd = 0
  let total = 0
  const commitKey = () => {
    if (curKey === null) return
    total += Math.max(sessEnd - sessStart, floorMs)
    result.set(curKey, total)
  }
  for (const { key, ts } of rows) {
    if (key !== curKey) {
      commitKey()
      curKey = key
      sessStart = ts
      sessEnd = ts
      total = 0
      continue
    }
    if (ts - sessEnd > gapMs) {
      total += Math.max(sessEnd - sessStart, floorMs)
      sessStart = ts
      sessEnd = ts
    } else {
      sessEnd = ts
    }
  }
  commitKey()
  return result
}

export async function sessionMsByWallets(
  wallets: string[],
  since?: number,
  gapMs: number = SESSION_GAP_MS,
  floorMs: number = SESSION_FLOOR_MS,
): Promise<Map<string, number>> {
  if (wallets.length === 0) return new Map()
  const conditions = [inArray(receipts.wallet, wallets)]
  if (since !== undefined) conditions.push(gte(receipts.ts, since))
  const rows = await db
    .select({ key: receipts.wallet, ts: receipts.ts })
    .from(receipts)
    .where(and(...conditions))
    .orderBy(asc(receipts.wallet), asc(receipts.ts))
  return clusterSessionMs(rows, gapMs, floorMs)
}

export async function sessionMsBySquads(
  squadIds: string[],
  since?: number,
  gapMs: number = SESSION_GAP_MS,
  floorMs: number = SESSION_FLOOR_MS,
): Promise<Map<string, number>> {
  if (squadIds.length === 0) return new Map()
  const conditions = [inArray(receipts.attributedSquadId, squadIds)]
  if (since !== undefined) conditions.push(gte(receipts.ts, since))
  const rows = await db
    .select({ key: receipts.attributedSquadId, ts: receipts.ts })
    .from(receipts)
    .where(and(...conditions))
    .orderBy(asc(receipts.attributedSquadId), asc(receipts.ts))
  const keyed = rows
    .filter((r): r is { key: string; ts: number } => r.key !== null)
  return clusterSessionMs(keyed, gapMs, floorMs)
}

export async function sessionMsForSquad(
  squadId: string,
  since?: number,
  gapMs: number = SESSION_GAP_MS,
  floorMs: number = SESSION_FLOOR_MS,
): Promise<number> {
  const map = await sessionMsBySquads([squadId], since, gapMs, floorMs)
  return map.get(squadId) ?? 0
}
