import { randomBytes, randomUUID } from 'node:crypto'
import {
  createSquadInviteBodySchema,
  errorResponse,
  reqLogger,
} from '@claudenomics/auth'
import { hit } from '@claudenomics/store'
import {
  createSquadInvite,
  getActiveSquadMembership,
  getSquadBySlug,
} from '@claudenomics/squads'
import { getUserByPrivyDid } from '@claudenomics/users'
import { authed } from '@/app/lib/request'
import { inviteDto } from '../../dto.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function generateInviteCode(): string {
  return randomBytes(18).toString('base64url')
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const log = reqLogger(randomUUID())
  const claims = await authed(req)
  if (!claims) return errorResponse('unauthorized')

  const rl = await hit(`squad_invite_create:${claims.sub}`, 30, 3600)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request')
  }
  const parsed = createSquadInviteBodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  try {
    const squad = await getSquadBySlug(params.slug)
    if (!squad) return errorResponse('not_found')

    const caller = await getUserByPrivyDid(claims.sub)
    if (!caller) return errorResponse('forbidden')

    const membership = await getActiveSquadMembership(squad.id, caller.id)
    if (!membership || membership.role !== 'captain') return errorResponse('forbidden')

    const invite = await createSquadInvite({
      squadId: squad.id,
      createdByUserId: caller.id,
      code: generateInviteCode(),
      label: parsed.data.label ?? null,
      maxUses: parsed.data.max_uses ?? null,
      expiresAt: parsed.data.expires_at ? new Date(parsed.data.expires_at) : null,
    })
    return Response.json(inviteDto(invite), { status: 201 })
  } catch {
    log.error({ event: 'squad_invite_create_failed', slug: params.slug })
    return errorResponse('internal')
  }
}
