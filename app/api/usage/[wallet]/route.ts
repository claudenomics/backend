import { errorResponse, reqLogger, verifyToken } from '@claudenomics/auth'
import { hit } from '@claudenomics/store'
import { getTotals } from '@claudenomics/receipts'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function bearer(req: Request): string | null {
  const raw = req.headers.get('authorization')
  if (!raw) return null
  const [scheme, token] = raw.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

export async function GET(req: Request, { params }: { params: { wallet: string } }) {
  const log = reqLogger(randomUUID())

  const token = bearer(req)
  if (!token) return errorResponse('unauthorized')

  let callerWallet: string
  try {
    const claims = await verifyToken(token)
    callerWallet = claims.wallet
  } catch {
    return errorResponse('unauthorized')
  }

  if (callerWallet !== params.wallet) return errorResponse('wallet_mismatch')

  const rl = await hit(`usage:${callerWallet}`, 60, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  try {
    const totals = await getTotals(callerWallet)
    return Response.json(totals)
  } catch {
    log.error({ event: 'usage_read_failed' })
    return errorResponse('internal')
  }
}
