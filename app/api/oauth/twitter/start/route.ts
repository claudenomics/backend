import { errorResponse, reqLogger } from '@claudenomics/auth'
import {
  buildAuthorizeUrl,
  generateNonce,
  generatePkce,
  signState,
} from '@claudenomics/oauth'
import { hit } from '@claudenomics/store'
import { ensureUser } from '@claudenomics/users'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { authed } from '@/app/lib/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const slugRegex = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/
const returnToRegex = /^\/[^\s]*$/

const startQuerySchema = z
  .object({
    action: z.enum(['link-profile', 'create-squad']),
    return_to: z.string().regex(returnToRegex),
    slug: z.string().trim().regex(slugRegex).optional(),
    name: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'create-squad') {
      if (!val.slug || !val.name) {
        ctx.addIssue({ code: 'custom', message: 'slug and name required for create-squad' })
      }
    }
  })

export async function GET(req: Request) {
  const log = reqLogger(randomUUID())
  const claims = await authed(req)
  if (!claims) return errorResponse('unauthorized')

  const rl = await hit(`oauth_start:${claims.sub}`, 30, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  const url = new URL(req.url)
  const parsed = startQuerySchema.safeParse({
    action: url.searchParams.get('action'),
    return_to: url.searchParams.get('return_to'),
    slug: url.searchParams.get('slug') ?? undefined,
    name: url.searchParams.get('name') ?? undefined,
  })
  if (!parsed.success) return errorResponse('invalid_request')

  try {
    const user = await ensureUser({
      privyDid: claims.sub,
      wallet: claims.wallet,
      email: claims.email,
    })
    const { verifier, challenge } = generatePkce()
    const args: Record<string, string> = {}
    if (parsed.data.action === 'create-squad' && parsed.data.slug && parsed.data.name) {
      args.slug = parsed.data.slug
      args.name = parsed.data.name
    }
    const state = await signState(user.id, {
      action: parsed.data.action,
      args,
      pkce_verifier: verifier,
      return_to: parsed.data.return_to,
      nonce: generateNonce(),
    })
    const authorizeUrl = buildAuthorizeUrl({ state, codeChallenge: challenge })
    return Response.redirect(authorizeUrl, 302)
  } catch (err) {
    log.error({ event: 'oauth_start_failed', err: String(err) })
    return errorResponse('internal')
  }
}
