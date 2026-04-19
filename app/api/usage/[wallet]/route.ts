import { errorResponse, reqLogger } from '@claudenomics/auth'
import { hit } from '@claudenomics/store'
import { getTotals } from '@claudenomics/receipts'
import { authed } from '@/app/lib/request'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { wallet: string } }) {
  const log = reqLogger(randomUUID())

  const claims = await authed(req)
  if (!claims) return errorResponse('unauthorized')
  if (claims.wallet !== params.wallet) return errorResponse('wallet_mismatch')

  const rl = await hit(`usage:${claims.wallet}`, 60, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  try {
    const totals = await getTotals(claims.wallet)
    return Response.json(totals)
  } catch {
    log.error({ event: 'usage_read_failed' })
    return errorResponse('internal')
  }
}
