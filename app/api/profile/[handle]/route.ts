import { errorResponse, reqLogger } from '@claudenomics/auth'
import { getLeagueById } from '@claudenomics/leagues'
import { clientIp, hit } from '@claudenomics/store'
import { getSocialAccountsByUserId, getUserByProfileIdentifier } from '@claudenomics/users'
import { randomUUID } from 'node:crypto'
import { publicProfileDto } from '../dto.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { handle: string } }) {
  const log = reqLogger(randomUUID())
  const identifier = params.handle

  const rl = await hit(`profile_public:${clientIp(req.headers)}`, 120, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  try {
    const user = await getUserByProfileIdentifier(identifier)
    if (!user) return errorResponse('not_found')
    const socials = await getSocialAccountsByUserId(user.id)
    const league = user.currentLeagueId ? await getLeagueById(user.currentLeagueId) : null
    return Response.json(publicProfileDto(user, socials, league?.slug ?? null))
  } catch {
    log.error({ event: 'profile_public_failed', handle: identifier })
    return errorResponse('internal')
  }
}
