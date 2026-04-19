import { randomUUID } from 'node:crypto'
import { acceptInviteBodySchema, errorResponse, reqLogger } from '@claudenomics/auth'
import { getLeagueById } from '@claudenomics/leagues'
import { hit } from '@claudenomics/store'
import {
  SquadInviteUnavailableError,
  getPrimaryActiveSquadInvite,
  getSquadById,
  joinSquadByInvite,
  listActiveSquadMembershipsBySquadId,
  listSquadSocialsBySquadId,
} from '@claudenomics/squads'
import { ensureUser, listUsersByIds } from '@claudenomics/users'
import { authed } from '@/app/lib/request'
import { squadDto } from '@/app/api/squads/dto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const log = reqLogger(randomUUID())
  const claims = await authed(req)
  if (!claims) return errorResponse('unauthorized')

  const rl = await hit(`invite_accept:${claims.sub}`, 30, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  let body: unknown = {}
  if (req.headers.get('content-length') !== '0' && req.headers.get('content-type')?.includes('application/json')) {
    try {
      body = await req.json()
    } catch {
      return errorResponse('invalid_request')
    }
  }
  const parsed = acceptInviteBodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  try {
    const user = await ensureUser({
      privyDid: claims.sub,
      wallet: claims.wallet,
      email: claims.email,
    })
    const { invite } = await joinSquadByInvite({
      code: params.code,
      userId: user.id,
      isPrimary: parsed.data.set_primary,
    })
    const squad = await getSquadById(invite.squadId)
    if (!squad) return errorResponse('internal')

    const memberships = await listActiveSquadMembershipsBySquadId(squad.id)
    const userIds = Array.from(new Set([squad.captainUserId, ...memberships.map(m => m.userId)]))
    const users = await listUsersByIds(userIds)
    const socials = await listSquadSocialsBySquadId(squad.id)
    const primaryInvite = await getPrimaryActiveSquadInvite(squad.id)
    const league = squad.currentLeagueId ? await getLeagueById(squad.currentLeagueId) : null

    return Response.json(
      squadDto({
        squad,
        memberships,
        users,
        socials,
        leagueSlug: league?.slug ?? null,
        invite: primaryInvite,
      }),
    )
  } catch (err) {
    if (err instanceof SquadInviteUnavailableError) {
      return errorResponse('squad_invite_unavailable')
    }
    log.error({ event: 'invite_accept_failed' })
    return errorResponse('internal')
  }
}
