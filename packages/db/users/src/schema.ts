import { leagues } from '@claudenomics/leagues/schema'
import { sql } from 'drizzle-orm'
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    privyDid: text('privy_did').notNull().unique(),
    wallet: text('wallet').notNull().unique(),
    email: text('email'),
    handle: text('handle').notNull().unique(),
    displayName: text('display_name'),
    bio: text('bio'),
    avatarUrl: text('avatar_url'),
    currentLeagueId: uuid('current_league_id').references(() => leagues.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  t => ({
    leagueIdx: index('users_current_league_id_idx').on(t.currentLeagueId),
  }),
)

export const socialAccounts = pgTable(
  'social_accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    handle: text('handle').notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  t => ({
    pk: primaryKey({ columns: [t.userId, t.provider] }),
    providerUserUnique: uniqueIndex('social_accounts_provider_user_unique').on(
      t.provider,
      t.providerUserId,
    ),
  }),
)
