import {
  RefreshError,
  errorResponse,
  refreshBodySchema,
  reqLogger,
  rotateRefreshToken,
  signToken,
} from '@claudenomics/auth'
import { clientIp, hit, refreshTokenStore } from '@claudenomics/store'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const log = reqLogger(randomUUID())

  const rl = await hit(`refresh:${clientIp(req.headers)}`, 20, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request')
  }
  const parsed = refreshBodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  let rotated
  try {
    rotated = await rotateRefreshToken(refreshTokenStore, parsed.data.refresh_token)
  } catch (err) {
    if (err instanceof RefreshError) {
      log.warn({ event: 'refresh_rejected', reason: err.reason })
      return errorResponse('unauthorized')
    }
    log.error({ event: 'refresh_error', err: (err as Error).message })
    return errorResponse('internal')
  }

  let signed
  try {
    signed = await signToken({
      sub: rotated.owner.sub,
      wallet: rotated.owner.wallet,
      email: rotated.owner.email ?? undefined,
    })
  } catch {
    await refreshTokenStore.revokeFamily(rotated.issued.familyId, new Date()).catch(() => {})
    log.error({ event: 'sign_failed_post_rotate' })
    return errorResponse('internal')
  }

  log.info({ event: 'token_refreshed', sub: rotated.owner.sub })
  return Response.json({
    token: signed.token,
    expires_at: signed.expiresAt,
    refresh_token: rotated.issued.token,
    refresh_expires_at: rotated.issued.expiresAt.getTime(),
    wallet: rotated.owner.wallet,
    user_id: rotated.owner.sub,
    email: rotated.owner.email ?? undefined,
  })
}
