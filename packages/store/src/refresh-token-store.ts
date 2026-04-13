import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db } from './db.js'
import { refreshTokens } from './schema.js'

export interface RefreshTokenRecord {
  id: string
  tokenHash: string
  familyId: string
  sub: string
  wallet: string
  email: string | null
  createdAt: Date
  expiresAt: Date
  consumedAt: Date | null
  replacedBy: string | null
  revokedAt: Date | null
}

export interface NewRefreshToken {
  id: string
  tokenHash: string
  familyId: string
  sub: string
  wallet: string
  email: string | null
  expiresAt: Date
}

export interface RefreshTokenStore {
  insert(row: NewRefreshToken): Promise<void>
  findByHash(hash: string): Promise<RefreshTokenRecord | null>
  markConsumedIfFresh(id: string, replacedBy: string, now: Date): Promise<boolean>
  revokeFamily(familyId: string, now: Date): Promise<number>
  revokeAllForSub(sub: string, now: Date): Promise<number>
  cleanupExpired(olderThan: Date): Promise<number>
}

export const refreshTokenStore: RefreshTokenStore = {
  async insert(row) {
    await db.insert(refreshTokens).values({
      id: row.id,
      tokenHash: row.tokenHash,
      familyId: row.familyId,
      sub: row.sub,
      wallet: row.wallet,
      email: row.email,
      expiresAt: row.expiresAt,
    })
  },

  async findByHash(hash) {
    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash))
    return row ?? null
  },

  async markConsumedIfFresh(id, replacedBy, now) {
    const rows = await db
      .update(refreshTokens)
      .set({ consumedAt: now, replacedBy })
      .where(
        and(
          eq(refreshTokens.id, id),
          isNull(refreshTokens.consumedAt),
          isNull(refreshTokens.revokedAt),
        ),
      )
      .returning({ id: refreshTokens.id })
    return rows.length > 0
  },

  async revokeFamily(familyId, now) {
    const rows = await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id })
    return rows.length
  },

  async revokeAllForSub(sub, now) {
    const rows = await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.sub, sub), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id })
    return rows.length
  },

  async cleanupExpired(olderThan) {
    const rows = await db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, olderThan))
      .returning({ id: refreshTokens.id })
    return rows.length
  },
}
