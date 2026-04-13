import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokenStore,
} from '@claudenomics/store'
import {
  RefreshError,
  generateRefreshToken,
  hashRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../src/refresh-token.js'

class FakeStore implements RefreshTokenStore {
  private rows = new Map<string, RefreshTokenRecord>()

  async insert(row: NewRefreshToken) {
    this.rows.set(row.id, {
      ...row,
      createdAt: new Date(),
      consumedAt: null,
      replacedBy: null,
      revokedAt: null,
    })
  }
  async findByHash(hash: string) {
    for (const r of this.rows.values()) if (r.tokenHash === hash) return { ...r }
    return null
  }
  async markConsumedIfFresh(id: string, replacedBy: string, now: Date) {
    const r = this.rows.get(id)
    if (!r || r.consumedAt !== null || r.revokedAt !== null) return false
    r.consumedAt = now
    r.replacedBy = replacedBy
    return true
  }
  async revokeFamily(familyId: string, now: Date) {
    let n = 0
    for (const r of this.rows.values()) {
      if (r.familyId === familyId && r.revokedAt === null) {
        r.revokedAt = now
        n++
      }
    }
    return n
  }
  async revokeAllForSub() {
    return 0
  }
  async cleanupExpired() {
    return 0
  }
}

const OWNER = { sub: 'did:privy:test', wallet: 'So11', email: null }

describe('refresh token helpers', () => {
  it('generates prefixed base64url tokens', () => {
    const a = generateRefreshToken()
    const b = generateRefreshToken()
    expect(a).toMatch(/^crn_refresh_[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })

  it('hashRefreshToken is deterministic sha256 hex', () => {
    expect(hashRefreshToken('x')).toBe(hashRefreshToken('x'))
    expect(hashRefreshToken('x')).not.toBe(hashRefreshToken('y'))
    expect(hashRefreshToken('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('issueRefreshToken', () => {
  it('inserts a record and returns the plaintext token', async () => {
    const store = new FakeStore()
    const issued = await issueRefreshToken(store, OWNER)
    const record = await store.findByHash(hashRefreshToken(issued.token))
    expect(record?.sub).toBe(OWNER.sub)
  })

  it('continues an existing family when familyId is provided', async () => {
    const store = new FakeStore()
    const first = await issueRefreshToken(store, OWNER)
    const second = await issueRefreshToken(store, { ...OWNER, familyId: first.familyId })
    expect(second.familyId).toBe(first.familyId)
  })
})

describe('rotateRefreshToken', () => {
  it('rotates a fresh token and preserves the family', async () => {
    const store = new FakeStore()
    const first = await issueRefreshToken(store, OWNER)
    const result = await rotateRefreshToken(store, first.token)
    expect(result.issued.familyId).toBe(first.familyId)
    expect(result.issued.token).not.toBe(first.token)
    const old = await store.findByHash(hashRefreshToken(first.token))
    expect(old!.consumedAt).not.toBeNull()
    expect(old!.replacedBy).toBe(result.issued.id)
  })

  it('rejects unknown tokens', async () => {
    await expect(rotateRefreshToken(new FakeStore(), 'crn_refresh_unknown')).rejects.toMatchObject({
      reason: 'not_found',
    })
  })

  it('rejects expired tokens', async () => {
    const store = new FakeStore()
    const t0 = new Date('2025-01-01T00:00:00Z')
    const issued = await issueRefreshToken(store, OWNER, t0)
    const after = new Date(issued.expiresAt.getTime() + 1)
    await expect(rotateRefreshToken(store, issued.token, after)).rejects.toMatchObject({
      reason: 'expired',
    })
  })

  it('rejects revoked tokens', async () => {
    const store = new FakeStore()
    const issued = await issueRefreshToken(store, OWNER)
    await store.revokeFamily(issued.familyId, new Date())
    await expect(rotateRefreshToken(store, issued.token)).rejects.toMatchObject({
      reason: 'revoked',
    })
  })

  it('issues a sibling for a legit concurrent rotation inside the grace window', async () => {
    const store = new FakeStore()
    const t0 = new Date('2025-01-01T00:00:00Z')
    const first = await issueRefreshToken(store, OWNER, t0)
    const winner = await rotateRefreshToken(store, first.token, t0)
    const t1 = new Date(t0.getTime() + 5_000)
    const loser = await rotateRefreshToken(store, first.token, t1)
    expect(loser.issued.familyId).toBe(first.familyId)
    expect(loser.issued.token).not.toBe(winner.issued.token)
    const winnerRec = await store.findByHash(hashRefreshToken(winner.issued.token))
    expect(winnerRec!.revokedAt).toBeNull()
  })

  it('revokes the family on replay past the grace window', async () => {
    const store = new FakeStore()
    const t0 = new Date('2025-01-01T00:00:00Z')
    const first = await issueRefreshToken(store, OWNER, t0)
    await rotateRefreshToken(store, first.token, t0)
    const far = new Date(t0.getTime() + 60_000)
    await expect(rotateRefreshToken(store, first.token, far)).rejects.toMatchObject({
      reason: 'reused',
    })
  })

  it('consumes the parent exactly once under concurrent rotation', async () => {
    const store = new FakeStore()
    const first = await issueRefreshToken(store, OWNER)
    const results = await Promise.all([
      rotateRefreshToken(store, first.token),
      rotateRefreshToken(store, first.token),
      rotateRefreshToken(store, first.token),
    ])
    for (const r of results) expect(r.issued.familyId).toBe(first.familyId)
    const parent = await store.findByHash(hashRefreshToken(first.token))
    expect(parent!.consumedAt).not.toBeNull()
    expect(parent!.revokedAt).toBeNull()
  })
})

describe('revokeRefreshToken', () => {
  it('revokes the family and returns true', async () => {
    const store = new FakeStore()
    const issued = await issueRefreshToken(store, OWNER)
    expect(await revokeRefreshToken(store, issued.token)).toBe(true)
    await expect(rotateRefreshToken(store, issued.token)).rejects.toMatchObject({
      reason: 'revoked',
    })
  })

  it('returns false for unknown tokens', async () => {
    expect(await revokeRefreshToken(new FakeStore(), 'crn_refresh_unknown')).toBe(false)
  })
})
