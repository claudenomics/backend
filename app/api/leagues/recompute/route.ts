import { errorResponse, reqLogger } from '@claudenomics/auth'
import { recomputeAllLeagues } from '@claudenomics/leagues'
import { randomUUID, timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function checkSecret(req: Request): boolean {
  const expected = process.env.LEAGUES_RECOMPUTE_SECRET
  if (!expected) return false
  const raw = req.headers.get('authorization')
  if (!raw) return false
  const [scheme, token] = raw.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return false
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const log = reqLogger(randomUUID())
  if (!checkSecret(req)) return errorResponse('unauthorized')

  const started = Date.now()
  try {
    const { users, squads } = await recomputeAllLeagues()
    const durationMs = Date.now() - started
    log.info({ event: 'leagues_recomputed', users, squads, durationMs })
    return Response.json({ ok: true, users, squads, durationMs })
  } catch (err) {
    log.error({ event: 'leagues_recompute_failed', err })
    return errorResponse('internal')
  }
}
