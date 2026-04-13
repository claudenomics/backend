import { AppError, errorResponse, privyAssociateBodySchema, reqLogger } from '@claudenomics/auth'
import { resolveUser, verifyAccessToken } from '@claudenomics/privy'
import { associate, clientIp, hit } from '@claudenomics/store'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const log = reqLogger(randomUUID())

  const ipRl = await hit(`privy-associate:ip:${clientIp(req.headers)}`, 10, 60)
  if (!ipRl.ok) return errorResponse('rate_limited', ipRl.retryAfter)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request')
  }
  const parsed = privyAssociateBodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  const codeRl = await hit(`privy-associate:code:${parsed.data.code}`, 3, 60)
  if (!codeRl.ok) return errorResponse('rate_limited', codeRl.retryAfter)

  try {
    const did = await verifyAccessToken(parsed.data.privyAccessToken)
    const user = await resolveUser(did)
    const row = await associate(parsed.data.code, {
      privyDid: user.did,
      wallet: user.wallet,
      email: user.email,
    })
    if (!row) return errorResponse('invalid_code')

    const target = new URL(row.callback)
    target.searchParams.set('code', row.code)
    target.searchParams.set('state', row.state)

    log.info({ event: 'associated', did: user.did })
    return Response.json({ redirectUrl: target.toString() })
  } catch (err) {
    if (err instanceof AppError) {
      log.warn({ event: 'associate_failed', code: err.code })
      return errorResponse(err.code)
    }
    log.error({ event: 'associate_error' })
    return errorResponse('internal')
  }
}
