import { randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import type { OAuthStatePayload } from './types.js'

const STATE_TTL_SECONDS = 300

function secret(): Uint8Array {
  const raw = process.env.OAUTH_STATE_SECRET
  if (!raw) throw new Error('OAUTH_STATE_SECRET is required')
  return new TextEncoder().encode(raw)
}

export function generateNonce(): string {
  return randomBytes(16).toString('base64url')
}

export async function signState(userId: string, payload: OAuthStatePayload): Promise<string> {
  return new SignJWT({ ...payload } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(secret())
}

export async function verifyState(token: string): Promise<{ userId: string } & OAuthStatePayload> {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
  const sub = payload.sub
  if (typeof sub !== 'string') throw new Error('state missing sub')
  const action = payload.action
  const args = payload.args
  const pkceVerifier = payload.pkce_verifier
  const returnTo = payload.return_to
  const nonce = payload.nonce
  if (
    (action !== 'link-profile' && action !== 'create-squad') ||
    typeof pkceVerifier !== 'string' ||
    typeof returnTo !== 'string' ||
    typeof nonce !== 'string' ||
    typeof args !== 'object' ||
    args === null
  ) {
    throw new Error('state payload malformed')
  }
  return {
    userId: sub,
    action,
    args: args as Record<string, string>,
    pkce_verifier: pkceVerifier,
    return_to: returnTo,
    nonce,
  }
}
