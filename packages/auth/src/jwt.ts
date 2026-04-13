import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type JWK,
  type KeyLike,
} from 'jose'
import { randomUUID } from 'node:crypto'

export const JWT_ALG = 'ES256' as const

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required`)
  return v
}

function decodePem(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8')
}

async function loadSigner(): Promise<{ kid: string; privateKey: KeyLike; publicJwk: JWK }> {
  const kid = env('JWT_KID')
  const privateKey = await importPKCS8(decodePem(env('JWT_PRIVATE_KEY')), JWT_ALG, {
    extractable: true,
  })
  const publicJwk = await exportJWK(privateKey)
  publicJwk.kid = kid
  publicJwk.alg = JWT_ALG
  publicJwk.use = 'sig'
  delete publicJwk.d
  return { kid, privateKey, publicJwk }
}

async function loadOldVerifier(): Promise<JWK | null> {
  const b64 = process.env.JWT_OLD_PUBLIC_KEY
  const kid = process.env.JWT_OLD_KID
  if (!b64 || !kid) return null
  const publicKey = await importSPKI(decodePem(b64), JWT_ALG, { extractable: true })
  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = kid
  publicJwk.alg = JWT_ALG
  publicJwk.use = 'sig'
  return publicJwk
}

export type Claims = {
  sub: string
  wallet: string
  email?: string
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got '${raw}'`)
  }
  return n
}

export async function signToken(claims: Claims): Promise<{ token: string; expiresAt: number }> {
  const signer = await loadSigner()
  const issuer = env('JWT_ISSUER')
  const audience = process.env.JWT_AUDIENCE ?? 'claudenomics'
  const ttl = positiveIntEnv('JWT_TTL_SECONDS', 3600)

  const now = Math.floor(Date.now() / 1000)
  const exp = now + ttl

  const jwt = await new SignJWT({
    wallet: claims.wallet,
    ...(claims.email ? { email: claims.email } : {}),
  })
    .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT', kid: signer.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(randomUUID())
    .sign(signer.privateKey)

  return { token: jwt, expiresAt: exp * 1000 }
}

export async function jwks(): Promise<{ keys: JWK[] }> {
  const [signer, old] = await Promise.all([loadSigner(), loadOldVerifier()])
  const keys: JWK[] = [signer.publicJwk]
  if (old) keys.push(old)
  return { keys }
}

export async function verifyToken(token: string): Promise<Claims> {
  const set = await jwks()
  const keyset = createLocalJWKSet(set)
  const { payload } = await jwtVerify(token, keyset, {
    issuer: env('JWT_ISSUER'),
    audience: process.env.JWT_AUDIENCE ?? 'claudenomics',
    algorithms: [JWT_ALG],
    requiredClaims: ['exp', 'iat', 'jti'],
  })
  if (typeof payload.sub !== 'string') throw new Error('jwt missing sub')
  if (typeof payload.wallet !== 'string') throw new Error('jwt missing wallet')
  return {
    sub: payload.sub,
    wallet: payload.wallet,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  }
}
