import { randomUUID } from 'node:crypto'
import { errorResponse, reqLogger } from '@claudenomics/auth'
import { getLeagueById } from '@claudenomics/leagues'
import { clientIp, hit } from '@claudenomics/store'
import {
  getActiveSquadMembership,
  getPrimaryActiveSquadInvite,
  getSquadBySlug,
  listActiveSquadMembershipsBySquadId,
  listSquadSocialsBySquadId,
} from '@claudenomics/squads'
import { getUserByPrivyDid, listUsersByIds } from '@claudenomics/users'
import { authed } from '@/app/lib/request'
import { squadDto } from '../dto.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const log = reqLogger(randomUUID())

  const rl = await hit(`squad_read:${clientIp(req.headers)}`, 120, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  try {
    const squad = await getSquadBySlug(params.slug)
    if (!squad) return errorResponse('not_found')

    const memberships = await listActiveSquadMembershipsBySquadId(squad.id)
    const userIds = Array.from(new Set([squad.captainUserId, ...memberships.map(m => m.userId)]))
    const users = await listUsersByIds(userIds)
    const socials = await listSquadSocialsBySquadId(squad.id)
    const league = squad.currentLeagueId ? await getLeagueById(squad.currentLeagueId) : null

    let invite = null
    const claims = await authed(req)
    if (claims) {
      const caller = await getUserByPrivyDid(claims.sub)
      if (caller) {
        const membership = await getActiveSquadMembership(squad.id, caller.id)
        if (membership) invite = await getPrimaryActiveSquadInvite(squad.id)
      }
    }

    return Response.json(
      squadDto({ squad, memberships, users, socials, leagueSlug: league?.slug ?? null, invite }),
    )
  } catch {
    log.error({ event: 'squad_read_failed', slug: params.slug })
    return errorResponse('internal')
  }
}
