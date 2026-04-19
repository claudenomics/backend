import { randomUUID } from 'node:crypto'
import { errorResponse, reqLogger } from '@claudenomics/auth'
import {
  modelBreakdownByWallets,
  providerBreakdownByWallets,
  sessionMsByWallets,
  sumTokensByWallets,
} from '@claudenomics/receipts'
import { clientIp, hit } from '@claudenomics/store'
import { getUserByProfileIdentifier } from '@claudenomics/users'
import { z } from 'zod'
import { PERIOD_MS, statsDto } from '@/app/api/_dto/stats'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'all']).default('all'),
})

export async function GET(req: Request, { params }: { params: { handle: string } }) {
  const log = reqLogger(randomUUID())

  const rl = await hit(`profile_stats:${clientIp(req.headers)}`, 120, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    period: url.searchParams.get('period') ?? undefined,
  })
  if (!parsed.success) return errorResponse('invalid_request')
  const { period } = parsed.data

  try {
    const user = await getUserByProfileIdentifier(params.handle)
    if (!user) return errorResponse('not_found')

    const since = period === 'all' ? undefined : Date.now() - PERIOD_MS[period]

    const [totals, models, providers, sessionMsMap] = await Promise.all([
      sumTokensByWallets([user.wallet], since),
      modelBreakdownByWallets([user.wallet], since),
      providerBreakdownByWallets([user.wallet], since),
      sessionMsByWallets([user.wallet], since),
    ])
    const sessionMs = sessionMsMap.get(user.wallet) ?? 0

    return Response.json(
      statsDto({ period, since: since ?? null, totals, models, providers, sessionMs }),
    )
  } catch {
    log.error({ event: 'profile_stats_failed', handle: params.handle })
    return errorResponse('internal')
  }
}
