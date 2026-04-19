import { randomUUID } from 'node:crypto'
import { errorResponse, reqLogger } from '@claudenomics/auth'
import { hit } from '@claudenomics/store'
import {
  getActiveSquadMembership,
  getSquadBySlug,
  leaveActiveSquadMembership,
} from '@claudenomics/squads'
import { getUserByPrivyDid } from '@claudenomics/users'
import { authed } from '@/app/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, { params }: { params: { slug: string } }) {
  const log = reqLogger(randomUUID())
  const claims = await authed(req)
  if (!claims) return errorResponse('unauthorized')

  const rl = await hit(`squad_leave:${claims.sub}`, 30, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  try {
    const squad = await getSquadBySlug(params.slug)
    if (!squad) return errorResponse('not_found')

    const caller = await getUserByPrivyDid(claims.sub)
    if (!caller) return errorResponse('not_found')

    const membership = await getActiveSquadMembership(squad.id, caller.id)
    if (!membership) return errorResponse('not_found')
    if (membership.role === 'captain') return errorResponse('captain_cannot_leave')

    await leaveActiveSquadMembership(squad.id, caller.id)
    return new Response(null, { status: 204 })
  } catch {
    log.error({ event: 'squad_leave_failed', slug: params.slug })
    return errorResponse('internal')
  }
}
