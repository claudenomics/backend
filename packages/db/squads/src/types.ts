import type {
  squadInvites,
  squadMemberships,
  squadSocials,
  squads,
} from './schema.js'

export type SquadRow = typeof squads.$inferSelect
export type NewSquad = typeof squads.$inferInsert

export type SquadSocialRow = typeof squadSocials.$inferSelect
export type NewSquadSocial = typeof squadSocials.$inferInsert

export type SquadInviteRow = typeof squadInvites.$inferSelect
export type NewSquadInvite = typeof squadInvites.$inferInsert

export type SquadMembershipRow = typeof squadMemberships.$inferSelect
export type NewSquadMembership = typeof squadMemberships.$inferInsert

export type SquadRole = 'captain' | 'member'

export interface SquadSocialBinding {
  provider: string
  providerUserId: string
  handle: string
  displayName?: string | null
  bio?: string | null
  avatarUrl?: string | null
}

export interface CreateSquadInput {
  slug: string
  name: string
  captainUserId: string
  currentLeagueId?: string | null
  defaultInviteCode: string
  twitter: SquadSocialBinding
}

export interface CreateSquadInviteInput {
  squadId: string
  createdByUserId: string
  code: string
  label?: string | null
  maxUses?: number | null
  expiresAt?: Date | null
}

export interface JoinSquadByInviteInput {
  code: string
  userId: string
  isPrimary?: boolean
  joinedAt?: Date
}
