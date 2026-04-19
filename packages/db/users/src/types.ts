import type { socialAccounts, users } from './schema.js'

export type UserRow = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type SocialAccount = typeof socialAccounts.$inferSelect
export type NewSocialAccount = typeof socialAccounts.$inferInsert

export type SocialProvider = 'x' | 'github' | 'discord'

export interface ProfilePatch {
  displayName?: string | null
  bio?: string | null
  avatarUrl?: string | null
}
