import { randomBytes, randomUUID } from 'node:crypto'
import { errorResponse, reqLogger } from '@claudenomics/auth'
import { exchangeCode, fetchProfile, verifyState } from '@claudenomics/oauth'
import { createSquadWithCaptain } from '@claudenomics/squads'
import { getUserById, upsertSocialAccount } from '@claudenomics/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TWITTER_PROVIDER = 'x'

function redirect(returnTo: string, params: Record<string, string>): Response {
  const base = new URL(
    returnTo,
    process.env.APP_BASE_URL ?? 'http://localhost:3000',
  )
  for (const [k, v] of Object.entries(params)) base.searchParams.set(k, v)
  return Response.redirect(base.toString(), 302)
}

function generateInviteCode(): string {
  return randomBytes(18).toString('base64url')
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}

export async function GET(req: Request) {
  const log = reqLogger(randomUUID())
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  if (!state) return errorResponse('oauth_state_invalid')

  let decoded: Awaited<ReturnType<typeof verifyState>>
  try {
    decoded = await verifyState(state)
  } catch {
    return errorResponse('oauth_state_invalid')
  }

  if (oauthError || !code) {
    log.warn({ event: 'oauth_callback_denied', err: oauthError })
    return redirect(decoded.return_to, { oauth: 'denied' })
  }

  const user = await getUserById(decoded.userId)
  if (!user) return errorResponse('oauth_state_invalid')

  let profile
  try {
    const tokens = await exchangeCode(code, decoded.pkce_verifier)
    profile = await fetchProfile(tokens.access_token)
  } catch (err) {
    log.error({ event: 'oauth_upstream_failed', err: String(err) })
    return redirect(decoded.return_to, { oauth: 'failed' })
  }

  try {
    if (decoded.action === 'link-profile') {
      await upsertSocialAccount({
        userId: user.id,
        provider: TWITTER_PROVIDER,
        providerUserId: profile.id,
        handle: profile.username,
      })
      return redirect(decoded.return_to, { oauth: 'success' })
    }

    const slug = decoded.args.slug
    const name = decoded.args.name
    if (!slug || !name) return errorResponse('oauth_state_invalid')

    await createSquadWithCaptain({
      slug,
      name,
      captainUserId: user.id,
      defaultInviteCode: generateInviteCode(),
      twitter: {
        provider: TWITTER_PROVIDER,
        providerUserId: profile.id,
        handle: profile.username,
        displayName: profile.name,
        bio: profile.description,
        avatarUrl: profile.profile_image_url,
      },
    })
    return redirect(decoded.return_to, { oauth: 'success', slug })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return redirect(decoded.return_to, { oauth: 'slug_taken' })
    }
    log.error({ event: 'oauth_action_failed', action: decoded.action, err: String(err) })
    return redirect(decoded.return_to, { oauth: 'failed' })
  }
}
