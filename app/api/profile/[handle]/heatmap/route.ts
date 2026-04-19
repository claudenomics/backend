import { randomUUID } from 'node:crypto'
import { errorResponse, reqLogger } from '@claudenomics/auth'
import { dailyBurnByWallet } from '@claudenomics/receipts'
import { clientIp, hit } from '@claudenomics/store'
import { getUserByProfileIdentifier } from '@claudenomics/users'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_DAYS = 371

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DAYS).default(MAX_DAYS),
})

function startOfUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS
}

function toUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function buildSeries(days: number, sinceMs: number, rows: { date: string; tokens: number }[]) {
  const byDate = new Map(rows.map(r => [r.date, r.tokens]))
  const entries: Array<{ date: string; value: number }> = []
  for (let i = 0; i < days; i++) {
    const date = toUtcDate(sinceMs + i * DAY_MS)
    entries.push({ date, value: byDate.get(date) ?? 0 })
  }
  return entries
}

export async function GET(req: Request, { params }: { params: { handle: string } }) {
  const log = reqLogger(randomUUID())

  const rl = await hit(`profile_heatmap:${clientIp(req.headers)}`, 120, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    days: url.searchParams.get('days') ?? undefined,
  })
  if (!parsed.success) return errorResponse('invalid_request')
  const { days } = parsed.data

  try {
    const user = await getUserByProfileIdentifier(params.handle)
    if (!user) return errorResponse('not_found')

    const since = startOfUtcDay(Date.now()) - (days - 1) * DAY_MS
    const rows = await dailyBurnByWallet(user.wallet, since)
    const entries = buildSeries(days, since, rows)

    return Response.json({ days, since, entries })
  } catch {
    log.error({ event: 'profile_heatmap_failed', handle: params.handle })
    return errorResponse('internal')
  }
}
