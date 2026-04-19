import {
  errorResponse,
  issueRefreshToken,
  reqLogger,
  signToken,
  tokenBodySchema,
  verifyChallenge,
} from '@claudenomics/auth'
import { clientIp, consume, hit, refreshTokenStore } from '@claudenomics/store'
import { ensureUser, UserConflictError } from '@claudenomics/users'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const log = reqLogger(randomUUID())

  const rl = await hit(`token:${clientIp(req.headers)}`, 10, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request')
  }
  const parsed = tokenBodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  const row = await consume(parsed.data.code)
  if (!row) return errorResponse('invalid_code')

  if (!verifyChallenge(parsed.data.code_verifier, row.codeChallenge)) {
    log.warn({ event: 'verifier_mismatch' })
    return errorResponse('verifier_mismatch')
  }

  if (!row.privyDid || !row.wallet) {
    log.warn({ event: 'unassociated_code' })
    return errorResponse('wallet_unavailable')
  }

  try {
    const { token, expiresAt } = await signToken({
      sub: row.privyDid,
      wallet: row.wallet,
      email: row.email ?? undefined,
    })
    const refresh = await issueRefreshToken(refreshTokenStore, {
      sub: row.privyDid,
      wallet: row.wallet,
      email: row.email,
    })
    await ensureUser({
      privyDid: row.privyDid,
      wallet: row.wallet,
      email: row.email,
    })
    log.info({ event: 'token_issued', sub: row.privyDid })
    return Response.json({
      token,
      expires_at: expiresAt,
      refresh_token: refresh.token,
      refresh_expires_at: refresh.expiresAt.getTime(),
      wallet: row.wallet,
      user_id: row.privyDid,
      email: row.email ?? undefined,
    })
  } catch (err) {
    if (err instanceof UserConflictError) {
      log.warn({ event: 'token_user_conflict', sub: row.privyDid, wallet: row.wallet })
      return errorResponse('wallet_conflict')
    }
    log.error({ event: 'sign_failed' })
    return errorResponse('internal')
  }
}
