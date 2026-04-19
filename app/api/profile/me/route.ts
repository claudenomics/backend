import { errorResponse, profilePatchBodySchema, reqLogger } from '@claudenomics/auth'
import { getLeagueById, getLeagueProgress } from '@claudenomics/leagues'
import { getTotals } from '@claudenomics/receipts'
import { hit } from '@claudenomics/store'
import {
  ensureUser,
  getSocialAccountsByUserId,
  UserConflictError,
  updateProfile,
} from '@claudenomics/users'
import { randomUUID } from 'node:crypto'
import { authed } from '@/app/lib/request'
import { meProfileDto } from '../dto.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveLeagueSlug(currentLeagueId: string | null): Promise<string | null> {
  if (!currentLeagueId) return null
  const league = await getLeagueById(currentLeagueId)
  return league?.slug ?? null
}

export async function GET(req: Request) {
  const log = reqLogger(randomUUID())
  const claims = await authed(req)
  if (!claims) return errorResponse('unauthorized')

  const rl = await hit(`profile_me:${claims.sub}`, 60, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  try {
    const user = await ensureUser({
      privyDid: claims.sub,
      wallet: claims.wallet,
      email: claims.email,
    })
    const socials = await getSocialAccountsByUserId(user.id)
    const leagueSlug = await resolveLeagueSlug(user.currentLeagueId)
    const totals = await getTotals(user.wallet)
    const progress = await getLeagueProgress(
      totals.input_tokens + totals.output_tokens,
      user.currentLeagueId,
    )
    return Response.json(meProfileDto(user, socials, leagueSlug, progress))
  } catch (err) {
    if (err instanceof UserConflictError) return errorResponse('wallet_conflict')
    log.error({ event: 'profile_me_failed' })
    return errorResponse('internal')
  }
}

export async function PATCH(req: Request) {
  const log = reqLogger(randomUUID())
  const claims = await authed(req)
  if (!claims) return errorResponse('unauthorized')

  const rl = await hit(`profile_me_patch:${claims.sub}`, 30, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request')
  }
  const parsed = profilePatchBodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  try {
    const user = await ensureUser({
      privyDid: claims.sub,
      wallet: claims.wallet,
      email: claims.email,
    })
    const updated = await updateProfile(user.id, {
      displayName: parsed.data.display_name,
      bio: parsed.data.bio,
      avatarUrl: parsed.data.avatar_url,
    })
    const socials = await getSocialAccountsByUserId(updated.id)
    const leagueSlug = await resolveLeagueSlug(updated.currentLeagueId)
    const totals = await getTotals(updated.wallet)
    const progress = await getLeagueProgress(
      totals.input_tokens + totals.output_tokens,
      updated.currentLeagueId,
    )
    return Response.json(meProfileDto(updated, socials, leagueSlug, progress))
  } catch (err) {
    if (err instanceof UserConflictError) return errorResponse('wallet_conflict')
    log.error({ event: 'profile_patch_failed' })
    return errorResponse('internal')
  }
}
