import { leagues } from '@claudenomics/leagues/schema'
import { users } from '@claudenomics/users/schema'
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const squads = pgTable(
  'squads',
  {
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    captainUserId: uuid('captain_user_id')
      .notNull()
      .references(() => users.id),
    currentLeagueId: uuid('current_league_id').references(() => leagues.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  t => ({
    captainIdx: index('squads_captain_user_id_idx').on(t.captainUserId),
    leagueIdx: index('squads_current_league_id_idx').on(t.currentLeagueId),
  }),
)

export const squadSocials = pgTable(
  'squad_socials',
  {
    squadId: uuid('squad_id')
      .notNull()
      .references(() => squads.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    handle: text('handle').notNull(),
    displayName: text('display_name'),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  t => ({
    pk: primaryKey({ columns: [t.squadId, t.provider] }),
    providerUserUnique: uniqueIndex('squad_socials_provider_user_unique').on(
      t.provider,
      t.providerUserId,
    ),
  }),
)

export const squadInvites = pgTable(
  'squad_invites',
  {
    id: uuid('id').primaryKey(),
    squadId: uuid('squad_id')
      .notNull()
      .references(() => squads.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    code: text('code').notNull().unique(),
    label: text('label'),
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  t => ({
    squadIdx: index('squad_invites_squad_id_idx').on(t.squadId),
    expiresIdx: index('squad_invites_expires_at_idx').on(t.expiresAt),
  }),
)

export const squadMemberships = pgTable(
  'squad_memberships',
  {
    id: uuid('id').primaryKey(),
    squadId: uuid('squad_id')
      .notNull()
      .references(() => squads.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    isPrimary: boolean('is_primary').notNull().default(false),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().default(sql`now()`),
    leftAt: timestamp('left_at', { withTimezone: true }),
    inviteId: uuid('invite_id').references(() => squadInvites.id, { onDelete: 'set null' }),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  },
  t => ({
    squadIdx: index('squad_memberships_squad_id_idx').on(t.squadId),
    userIdx: index('squad_memberships_user_id_idx').on(t.userId),
    activeMembershipUnique: uniqueIndex('squad_memberships_active_unique')
      .on(t.squadId, t.userId)
      .where(sql`${t.leftAt} is null`),
    activePrimaryUnique: uniqueIndex('squad_memberships_active_primary_unique')
      .on(t.userId)
      .where(sql`${t.leftAt} is null and ${t.isPrimary} = true`),
    activeCaptainUnique: uniqueIndex('squad_memberships_active_captain_unique')
      .on(t.squadId)
      .where(sql`${t.leftAt} is null and ${t.role} = 'captain'`),
  }),
)
