import {
  errorResponse,
  reqLogger,
  revokeBodySchema,
  revokeRefreshToken,
} from '@claudenomics/auth'
import { clientIp, hit, refreshTokenStore } from '@claudenomics/store'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const log = reqLogger(randomUUID())

  const rl = await hit(`revoke:${clientIp(req.headers)}`, 20, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request')
  }
  const parsed = revokeBodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  try {
    await revokeRefreshToken(refreshTokenStore, parsed.data.refresh_token)
  } catch (err) {
    log.error({ event: 'revoke_error', err: (err as Error).message })
  }
  return new Response(null, { status: 204 })
}
