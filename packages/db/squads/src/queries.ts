import { randomUUID } from 'node:crypto'
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@claudenomics/store'
import { squadInvites, squadMemberships, squadSocials, squads } from './schema.js'
import type {
  CreateSquadInput,
  CreateSquadInviteInput,
  JoinSquadByInviteInput,
  SquadInviteRow,
  SquadMembershipRow,
  SquadRow,
  SquadSocialRow,
} from './types.js'

export class SquadInviteUnavailableError extends Error {
  constructor(message: string = 'squad invite is unavailable') {
    super(message)
    this.name = 'SquadInviteUnavailableError'
  }
}

export async function getSquadById(id: string): Promise<SquadRow | null> {
  const [row] = await db.select().from(squads).where(eq(squads.id, id)).limit(1)
  return row ?? null
}

export async function getSquadBySlug(slug: string): Promise<SquadRow | null> {
  const [row] = await db.select().from(squads).where(eq(squads.slug, slug)).limit(1)
  return row ?? null
}

export async function listSquadsByIds(ids: string[]): Promise<Map<string, SquadRow>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select().from(squads).where(inArray(squads.id, ids))
  return new Map(rows.map(r => [r.id, r]))
}

export async function listSquadSocialsByProvider(
  squadIds: string[],
  provider: string,
): Promise<Map<string, SquadSocialRow>> {
  if (squadIds.length === 0) return new Map()
  const rows = await db
    .select()
    .from(squadSocials)
    .where(and(inArray(squadSocials.squadId, squadIds), eq(squadSocials.provider, provider)))
  return new Map(rows.map(r => [r.squadId, r]))
}

export async function getSquadSocial(
  squadId: string,
  provider: string,
): Promise<SquadSocialRow | null> {
  const [row] = await db
    .select()
    .from(squadSocials)
    .where(and(eq(squadSocials.squadId, squadId), eq(squadSocials.provider, provider)))
    .limit(1)
  return row ?? null
}

export async function listSquadSocialsBySquadId(squadId: string): Promise<SquadSocialRow[]> {
  return db
    .select()
    .from(squadSocials)
    .where(eq(squadSocials.squadId, squadId))
    .orderBy(asc(squadSocials.connectedAt))
}

export async function getSquadInviteById(id: string): Promise<SquadInviteRow | null> {
  const [row] = await db.select().from(squadInvites).where(eq(squadInvites.id, id)).limit(1)
  return row ?? null
}

export async function getSquadInviteByCode(code: string): Promise<SquadInviteRow | null> {
  const [row] = await db.select().from(squadInvites).where(eq(squadInvites.code, code)).limit(1)
  return row ?? null
}

export async function getPrimaryActiveSquadInvite(squadId: string): Promise<SquadInviteRow | null> {
  const [row] = await db
    .select()
    .from(squadInvites)
    .where(and(eq(squadInvites.squadId, squadId), isNull(squadInvites.revokedAt)))
    .orderBy(asc(squadInvites.createdAt))
    .limit(1)
  return row ?? null
}

export async function getActiveSquadMembership(
  squadId: string,
  userId: string,
): Promise<SquadMembershipRow | null> {
  const [row] = await db
    .select()
    .from(squadMemberships)
    .where(
      and(
        eq(squadMemberships.squadId, squadId),
        eq(squadMemberships.userId, userId),
        isNull(squadMemberships.leftAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function getActivePrimarySquadMembershipByUserId(
  userId: string,
): Promise<SquadMembershipRow | null> {
  const [row] = await db
    .select()
    .from(squadMemberships)
    .where(
      and(
        eq(squadMemberships.userId, userId),
        eq(squadMemberships.isPrimary, true),
        isNull(squadMemberships.leftAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function listActiveSquadMembershipsBySquadId(
  squadId: string,
): Promise<SquadMembershipRow[]> {
  return db
    .select()
    .from(squadMemberships)
    .where(and(eq(squadMemberships.squadId, squadId), isNull(squadMemberships.leftAt)))
    .orderBy(asc(squadMemberships.joinedAt))
}

export async function listActiveSquadMembershipsByUserId(
  userId: string,
): Promise<SquadMembershipRow[]> {
  return db
    .select()
    .from(squadMemberships)
    .where(and(eq(squadMemberships.userId, userId), isNull(squadMemberships.leftAt)))
    .orderBy(asc(squadMemberships.joinedAt))
}

export async function createSquadWithCaptain(
  input: CreateSquadInput,
): Promise<{
  squad: SquadRow
  captainMembership: SquadMembershipRow
  defaultInvite: SquadInviteRow
  twitterSocial: SquadSocialRow
}> {
  return db.transaction(async tx => {
    const [squad] = await tx
      .insert(squads)
      .values({
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        captainUserId: input.captainUserId,
        currentLeagueId: input.currentLeagueId ?? null,
      })
      .returning()
    if (!squad) throw new Error(`failed to create squad ${input.slug}`)

    const [twitterSocial] = await tx
      .insert(squadSocials)
      .values({
        squadId: squad.id,
        provider: input.twitter.provider,
        providerUserId: input.twitter.providerUserId,
        handle: input.twitter.handle,
        displayName: input.twitter.displayName ?? null,
        bio: input.twitter.bio ?? null,
        avatarUrl: input.twitter.avatarUrl ?? null,
      })
      .returning()
    if (!twitterSocial) throw new Error(`failed to bind twitter social for squad ${input.slug}`)

    const [defaultInvite] = await tx
      .insert(squadInvites)
      .values({
        id: randomUUID(),
        squadId: squad.id,
        createdByUserId: input.captainUserId,
        code: input.defaultInviteCode,
      })
      .returning()
    if (!defaultInvite) throw new Error(`failed to create initial invite for squad ${input.slug}`)

    await tx
      .update(squadMemberships)
      .set({ isPrimary: false })
      .where(
        and(
          eq(squadMemberships.userId, input.captainUserId),
          eq(squadMemberships.isPrimary, true),
          isNull(squadMemberships.leftAt),
        ),
      )

    const [captainMembership] = await tx
      .insert(squadMemberships)
      .values({
        id: randomUUID(),
        squadId: squad.id,
        userId: input.captainUserId,
        role: 'captain',
        isPrimary: true,
        inviteId: defaultInvite.id,
        invitedByUserId: input.captainUserId,
      })
      .returning()
    if (!captainMembership) throw new Error(`failed to create captain membership for squad ${input.slug}`)

    return { squad, captainMembership, defaultInvite, twitterSocial }
  })
}

export async function createSquadInvite(input: CreateSquadInviteInput): Promise<SquadInviteRow> {
  const [row] = await db
    .insert(squadInvites)
    .values({
      id: randomUUID(),
      squadId: input.squadId,
      createdByUserId: input.createdByUserId,
      code: input.code,
      label: input.label ?? null,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning()
  if (!row) throw new Error(`failed to create invite for squad ${input.squadId}`)
  return row
}

export async function leaveActiveSquadMembership(
  squadId: string,
  userId: string,
  leftAt: Date = new Date(),
): Promise<SquadMembershipRow | null> {
  const [row] = await db
    .update(squadMemberships)
    .set({
      isPrimary: false,
      leftAt,
    })
    .where(
      and(
        eq(squadMemberships.squadId, squadId),
        eq(squadMemberships.userId, userId),
        isNull(squadMemberships.leftAt),
      ),
    )
    .returning()
  return row ?? null
}

export async function revokeSquadInvite(
  inviteId: string,
  revokedAt: Date = new Date(),
): Promise<SquadInviteRow | null> {
  const [row] = await db
    .update(squadInvites)
    .set({ revokedAt })
    .where(eq(squadInvites.id, inviteId))
    .returning()
  return row ?? null
}

export async function joinSquadByInvite(
  input: JoinSquadByInviteInput,
): Promise<{
  invite: SquadInviteRow
  membership: SquadMembershipRow
  joined: boolean
}> {
  return db.transaction(async tx => {
    const [invite] = await tx
      .select()
      .from(squadInvites)
      .where(eq(squadInvites.code, input.code))
      .limit(1)

    if (!invite) throw new SquadInviteUnavailableError('squad invite was not found')
    if (invite.revokedAt) throw new SquadInviteUnavailableError('squad invite has been revoked')

    const joinedAt = input.joinedAt ?? new Date()
    if (invite.expiresAt && invite.expiresAt.getTime() < joinedAt.getTime()) {
      throw new SquadInviteUnavailableError('squad invite has expired')
    }

    const [existingMembership] = await tx
      .select()
      .from(squadMemberships)
      .where(
        and(
          eq(squadMemberships.squadId, invite.squadId),
          eq(squadMemberships.userId, input.userId),
          isNull(squadMemberships.leftAt),
        ),
      )
      .limit(1)

    if (existingMembership) {
      if (input.isPrimary ?? true) {
        await tx
          .update(squadMemberships)
          .set({ isPrimary: false })
          .where(
            and(
              eq(squadMemberships.userId, input.userId),
              eq(squadMemberships.isPrimary, true),
              isNull(squadMemberships.leftAt),
            ),
          )

        const [primaryMembership] = await tx
          .update(squadMemberships)
          .set({ isPrimary: true })
          .where(eq(squadMemberships.id, existingMembership.id))
          .returning()
        if (!primaryMembership) {
          throw new Error(`failed to set membership ${existingMembership.id} as primary`)
        }
        return { invite, membership: primaryMembership, joined: false }
      }

      return { invite, membership: existingMembership, joined: false }
    }

    if (input.isPrimary ?? true) {
      await tx
        .update(squadMemberships)
        .set({ isPrimary: false })
        .where(
          and(
            eq(squadMemberships.userId, input.userId),
            eq(squadMemberships.isPrimary, true),
            isNull(squadMemberships.leftAt),
          ),
        )
    }

    const [membership] = await tx
      .insert(squadMemberships)
      .values({
        id: randomUUID(),
        squadId: invite.squadId,
        userId: input.userId,
        role: 'member',
        isPrimary: input.isPrimary ?? true,
        joinedAt,
        inviteId: invite.id,
        invitedByUserId: invite.createdByUserId,
      })
      .returning()
    if (!membership) throw new Error(`failed to create membership from invite ${invite.id}`)

    const [updatedInvite] = await tx
      .update(squadInvites)
      .set({
        useCount: sql`${squadInvites.useCount} + 1`,
        lastUsedAt: joinedAt,
      })
      .where(
        and(
          eq(squadInvites.id, invite.id),
          isNull(squadInvites.revokedAt),
          or(isNull(squadInvites.expiresAt), gte(squadInvites.expiresAt, joinedAt)),
          or(isNull(squadInvites.maxUses), lt(squadInvites.useCount, squadInvites.maxUses)),
        ),
      )
      .returning()

    if (!updatedInvite) {
      throw new SquadInviteUnavailableError('squad invite is no longer joinable')
    }

    return { invite: updatedInvite, membership, joined: true }
  })
}
