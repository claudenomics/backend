import { randomBytes, randomUUID } from 'node:crypto'
import { createSquadBodySchema, errorResponse, reqLogger } from '@claudenomics/auth'
import { hit } from '@claudenomics/store'
import {
  createSquadWithCaptain,
  listActiveSquadMembershipsBySquadId,
  listSquadSocialsBySquadId,
} from '@claudenomics/squads'
import { ensureUser, listUsersByIds } from '@claudenomics/users'
import { authed } from '@/app/lib/request'
import { squadDto } from './dto.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function generateInviteCode(): string {
  return randomBytes(18).toString('base64url')
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}

export async function POST(req: Request) {
  const log = reqLogger(randomUUID())
  const claims = await authed(req)
  if (!claims) return errorResponse('unauthorized')

  const rl = await hit(`squad_create:${claims.sub}`, 5, 3600)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request')
  }
  const parsed = createSquadBodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  try {
    const user = await ensureUser({
      privyDid: claims.sub,
      wallet: claims.wallet,
      email: claims.email,
    })
    const { squad, defaultInvite } = await createSquadWithCaptain({
      slug: parsed.data.slug,
      name: parsed.data.name,
      captainUserId: user.id,
      defaultInviteCode: generateInviteCode(),
      twitter: {
        provider: 'x',
        providerUserId: parsed.data.twitter.provider_user_id,
        handle: parsed.data.twitter.handle,
        displayName: parsed.data.twitter.display_name ?? null,
        bio: parsed.data.twitter.bio ?? null,
        avatarUrl: parsed.data.twitter.avatar_url ?? null,
      },
    })
    const memberships = await listActiveSquadMembershipsBySquadId(squad.id)
    const userIds = Array.from(new Set([squad.captainUserId, ...memberships.map(m => m.userId)]))
    const users = await listUsersByIds(userIds)
    const socials = await listSquadSocialsBySquadId(squad.id)
    return Response.json(
      squadDto({
        squad,
        memberships,
        users,
        socials,
        leagueSlug: null,
        invite: defaultInvite,
      }),
      { status: 201 },
    )
  } catch (err) {
    if (isUniqueViolation(err)) return errorResponse('slug_taken')
    log.error({ event: 'squad_create_failed' })
    return errorResponse('internal')
  }
}
