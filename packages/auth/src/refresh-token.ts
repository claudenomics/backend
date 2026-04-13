import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { RefreshTokenRecord, RefreshTokenStore } from '@claudenomics/store'

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60
const GRACE_MS = 30_000
const PREFIX = 'crn_refresh_'

function ttlSeconds(): number {
  const raw = process.env.REFRESH_TOKEN_TTL_SECONDS
  if (raw === undefined || raw === '') return DEFAULT_TTL_SECONDS
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`REFRESH_TOKEN_TTL_SECONDS must be a positive integer, got '${raw}'`)
  }
  return n
}

const TTL_SECONDS = ttlSeconds()

export type RefreshFailureReason = 'not_found' | 'revoked' | 'expired' | 'reused'

export class RefreshError extends Error {
  constructor(public reason: RefreshFailureReason) {
    super(reason)
  }
}

export function generateRefreshToken(): string {
  return PREFIX + randomBytes(32).toString('base64url')
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface IssueRefreshParams {
  sub: string
  wallet: string
  email?: string | null
  familyId?: string
}

export interface IssuedRefreshToken {
  token: string
  id: string
  familyId: string
  expiresAt: Date
}

export async function issueRefreshToken(
  store: RefreshTokenStore,
  params: IssueRefreshParams,
  now: Date = new Date(),
): Promise<IssuedRefreshToken> {
  const token = generateRefreshToken()
  const id = randomUUID()
  const familyId = params.familyId ?? randomUUID()
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000)
  await store.insert({
    id,
    tokenHash: hashRefreshToken(token),
    familyId,
    sub: params.sub,
    wallet: params.wallet,
    email: params.email ?? null,
    expiresAt,
  })
  return { token, id, familyId, expiresAt }
}

export interface RotateRefreshResult {
  issued: IssuedRefreshToken
  owner: Pick<RefreshTokenRecord, 'sub' | 'wallet' | 'email'>
}

export async function rotateRefreshToken(
  store: RefreshTokenStore,
  token: string,
  now: Date = new Date(),
): Promise<RotateRefreshResult> {
  const hash = hashRefreshToken(token)
  const existing = await store.findByHash(hash)
  if (!existing) throw new RefreshError('not_found')
  if (existing.revokedAt !== null) throw new RefreshError('revoked')
  if (existing.expiresAt.getTime() <= now.getTime()) throw new RefreshError('expired')

  if (existing.consumedAt !== null) {
    return sibling(store, existing, existing.consumedAt, now)
  }

  const owner = { sub: existing.sub, wallet: existing.wallet, email: existing.email }
  const issued = await issueRefreshToken(store, { ...owner, familyId: existing.familyId }, now)
  if (await store.markConsumedIfFresh(existing.id, issued.id, now)) {
    return { issued, owner }
  }

  const reloaded = await store.findByHash(hash)
  if (!reloaded || reloaded.consumedAt === null) {
    await store.revokeFamily(existing.familyId, now)
    throw new RefreshError('reused')
  }
  return sibling(store, reloaded, reloaded.consumedAt, now, issued)
}

async function sibling(
  store: RefreshTokenStore,
  existing: RefreshTokenRecord,
  consumedAt: Date,
  now: Date,
  alreadyIssued?: IssuedRefreshToken,
): Promise<RotateRefreshResult> {
  if (now.getTime() - consumedAt.getTime() >= GRACE_MS) {
    await store.revokeFamily(existing.familyId, now)
    throw new RefreshError('reused')
  }
  const owner = { sub: existing.sub, wallet: existing.wallet, email: existing.email }
  const issued =
    alreadyIssued ??
    (await issueRefreshToken(store, { ...owner, familyId: existing.familyId }, now))
  return { issued, owner }
}

export async function revokeRefreshToken(
  store: RefreshTokenStore,
  token: string,
  now: Date = new Date(),
): Promise<boolean> {
  const existing = await store.findByHash(hashRefreshToken(token))
  if (!existing) return false
  await store.revokeFamily(existing.familyId, now)
  return true
}
