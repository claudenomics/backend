import { randomUUID } from 'node:crypto'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@claudenomics/store'
import { socialAccounts, users } from './schema.js'
import type { ProfilePatch, SocialAccount, UserRow } from './types.js'

export class UserConflictError extends Error {
  constructor(message: string = 'wallet already linked to another user') {
    super(message)
    this.name = 'UserConflictError'
  }
}

export interface EnsureUserInput {
  privyDid: string
  wallet: string
  email?: string | null
}

function normalizedEmail(email?: string | null): string | null {
  return email ?? null
}

export async function ensureUser(input: EnsureUserInput): Promise<UserRow> {
  return db.transaction(async tx => {
    const [existingByPrivyDid] = await tx
      .select()
      .from(users)
      .where(eq(users.privyDid, input.privyDid))
      .limit(1)

    const [existingByWallet] = await tx
      .select()
      .from(users)
      .where(eq(users.wallet, input.wallet))
      .limit(1)

    if (existingByWallet && existingByWallet.privyDid !== input.privyDid) {
      throw new UserConflictError()
    }

    if (existingByPrivyDid) {
      const email = normalizedEmail(input.email)
      if (existingByPrivyDid.wallet === input.wallet && existingByPrivyDid.email === email) {
        return existingByPrivyDid
      }

      const [updated] = await tx
        .update(users)
        .set({
          wallet: input.wallet,
          email,
          updatedAt: sql`now()`,
        })
        .where(eq(users.id, existingByPrivyDid.id))
        .returning()

      if (!updated) throw new Error(`user ${existingByPrivyDid.id} not found`)
      return updated
    }

    const [inserted] = await tx
      .insert(users)
      .values({
        id: randomUUID(),
        privyDid: input.privyDid,
        wallet: input.wallet,
        email: normalizedEmail(input.email),
        handle: input.wallet,
      })
      .returning()

    if (!inserted) throw new Error(`failed to create user for ${input.privyDid}`)
    return inserted
  })
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row ?? null
}

export async function getUserByHandle(handle: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.handle, handle))
  return row ?? null
}

export async function getUserByWallet(wallet: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.wallet, wallet))
  return row ?? null
}

export async function getUserByProfileIdentifier(identifier: string): Promise<UserRow | null> {
  const byWallet = await getUserByWallet(identifier)
  if (byWallet) return byWallet
  return getUserByHandle(identifier)
}

export async function getUserByPrivyDid(privyDid: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.privyDid, privyDid))
  return row ?? null
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<UserRow> {
  const updates: Record<string, unknown> = { updatedAt: sql`now()` }
  if (patch.displayName !== undefined) updates.displayName = patch.displayName
  if (patch.bio !== undefined) updates.bio = patch.bio
  if (patch.avatarUrl !== undefined) updates.avatarUrl = patch.avatarUrl
  const [row] = await db.update(users).set(updates).where(eq(users.id, id)).returning()
  if (!row) throw new Error(`user ${id} not found`)
  return row
}

export async function listUsersByIds(ids: string[]): Promise<Map<string, UserRow>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select().from(users).where(inArray(users.id, ids))
  return new Map(rows.map(r => [r.id, r]))
}

export async function listUsersByWallets(wallets: string[]): Promise<Map<string, UserRow>> {
  if (wallets.length === 0) return new Map()
  const rows = await db.select().from(users).where(inArray(users.wallet, wallets))
  return new Map(rows.map(r => [r.wallet, r]))
}

export async function getSocialAccountsByUserId(userId: string): Promise<SocialAccount[]> {
  return db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.userId, userId))
    .orderBy(asc(socialAccounts.connectedAt))
}

export async function upsertSocialAccount(input: {
  userId: string
  provider: string
  providerUserId: string
  handle: string
}): Promise<SocialAccount> {
  const [row] = await db
    .insert(socialAccounts)
    .values({
      userId: input.userId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      handle: input.handle,
    })
    .onConflictDoUpdate({
      target: [socialAccounts.userId, socialAccounts.provider],
      set: {
        providerUserId: input.providerUserId,
        handle: input.handle,
        connectedAt: sql`now()`,
      },
    })
    .returning()
  if (!row) throw new Error(`failed to upsert social for ${input.userId}/${input.provider}`)
  return row
}

