import { randomUUID } from 'node:crypto'
import { errorResponse, reqLogger } from '@claudenomics/auth'
import {
  modelBreakdownBySquad,
  providerBreakdownBySquad,
  sessionMsForSquad,
  sumTokensBySquad,
} from '@claudenomics/receipts'
import { getSquadBySlug } from '@claudenomics/squads'
import { clientIp, hit } from '@claudenomics/store'
import { z } from 'zod'
import { PERIOD_MS, statsDto } from '@/app/api/_dto/stats'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'all']).default('all'),
})

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const log = reqLogger(randomUUID())

  const rl = await hit(`squad_stats:${clientIp(req.headers)}`, 60, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    period: url.searchParams.get('period') ?? undefined,
  })
  if (!parsed.success) return errorResponse('invalid_request')
  const { period } = parsed.data

  try {
    const squad = await getSquadBySlug(params.slug)
    if (!squad) return errorResponse('not_found')

    const since = period === 'all' ? undefined : Date.now() - PERIOD_MS[period]

    const [totals, models, providers, sessionMs] = await Promise.all([
      sumTokensBySquad(squad.id, since),
      modelBreakdownBySquad(squad.id, since),
      providerBreakdownBySquad(squad.id, since),
      sessionMsForSquad(squad.id, since),
    ])

    return Response.json(
      statsDto({ period, since: since ?? null, totals, models, providers, sessionMs }),
    )
  } catch {
    log.error({ event: 'squad_stats_failed', slug: params.slug })
    return errorResponse('internal')
  }
}
