import { randomUUID } from 'node:crypto'
import { errorResponse, reqLogger } from '@claudenomics/auth'
import { hit } from '@claudenomics/store'
import {
  getActiveSquadMembership,
  getSquadBySlug,
  getSquadInviteByCode,
  revokeSquadInvite,
} from '@claudenomics/squads'
import { getUserByPrivyDid } from '@claudenomics/users'
import { authed } from '@/app/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
  req: Request,
  { params }: { params: { slug: string; code: string } },
) {
  const log = reqLogger(randomUUID())
  const claims = await authed(req)
  if (!claims) return errorResponse('unauthorized')

  const rl = await hit(`squad_invite_revoke:${claims.sub}`, 60, 3600)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  try {
    const squad = await getSquadBySlug(params.slug)
    if (!squad) return errorResponse('not_found')

    const invite = await getSquadInviteByCode(params.code)
    if (!invite || invite.squadId !== squad.id) return errorResponse('not_found')

    const caller = await getUserByPrivyDid(claims.sub)
    if (!caller) return errorResponse('forbidden')

    const membership = await getActiveSquadMembership(squad.id, caller.id)
    if (!membership || membership.role !== 'captain') return errorResponse('forbidden')

    await revokeSquadInvite(invite.id)
    return new Response(null, { status: 204 })
  } catch {
    log.error({ event: 'squad_invite_revoke_failed', slug: params.slug })
    return errorResponse('internal')
  }
}
