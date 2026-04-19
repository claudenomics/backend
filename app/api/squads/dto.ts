import type {
  SquadInviteRow,
  SquadMembershipRow,
  SquadRow,
  SquadSocialRow,
} from '@claudenomics/squads'
import type { UserRow } from '@claudenomics/users'

const DEFAULT_LEAGUE_SLUG = 'bronze'

function memberUserDto(user: UserRow) {
  return {
    handle: user.handle,
    wallet: user.wallet,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
  }
}

export function memberDto(membership: SquadMembershipRow, user: UserRow) {
  return {
    ...memberUserDto(user),
    role: membership.role,
    is_primary: membership.isPrimary,
    joined_at: membership.joinedAt.getTime(),
  }
}

export function inviteDto(invite: SquadInviteRow) {
  return {
    code: invite.code,
    label: invite.label,
    max_uses: invite.maxUses,
    use_count: invite.useCount,
    expires_at: invite.expiresAt?.getTime() ?? null,
    revoked_at: invite.revokedAt?.getTime() ?? null,
    last_used_at: invite.lastUsedAt?.getTime() ?? null,
    created_at: invite.createdAt.getTime(),
  }
}

function socialDto(social: SquadSocialRow) {
  return {
    provider: social.provider,
    handle: social.handle,
    display_name: social.displayName,
    bio: social.bio,
    avatar_url: social.avatarUrl,
    connected_at: social.connectedAt.getTime(),
  }
}

interface SquadDtoInput {
  squad: SquadRow
  memberships: SquadMembershipRow[]
  users: Map<string, UserRow>
  socials: SquadSocialRow[]
  leagueSlug: string | null
  invite?: SquadInviteRow | null
}

export function squadDto({ squad, memberships, users, socials, leagueSlug, invite }: SquadDtoInput) {
  const captainUser = users.get(squad.captainUserId)
  const members = memberships
    .map(m => {
      const user = users.get(m.userId)
      return user ? memberDto(m, user) : null
    })
    .filter((m): m is ReturnType<typeof memberDto> => m !== null)
  const twitter = socials.find(s => s.provider === 'x') ?? null

  return {
    slug: squad.slug,
    name: squad.name,
    bio: twitter?.bio ?? null,
    avatar_url: twitter?.avatarUrl ?? null,
    league: leagueSlug ?? DEFAULT_LEAGUE_SLUG,
    captain: captainUser ? memberUserDto(captainUser) : null,
    members,
    member_count: members.length,
    socials: socials.map(socialDto),
    invite: invite ? inviteDto(invite) : null,
    created_at: squad.createdAt.getTime(),
    updated_at: squad.updatedAt.getTime(),
  }
}
