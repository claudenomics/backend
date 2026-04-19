import type { SocialAccount, UserRow } from '@claudenomics/users'

const DEFAULT_LEAGUE_SLUG = 'bronze'

function socialDto(s: SocialAccount) {
  return {
    provider: s.provider,
    handle: s.handle,
    connected_at: s.connectedAt.getTime(),
  }
}

export function publicProfileDto(
  user: UserRow,
  socials: SocialAccount[],
  leagueSlug: string | null,
) {
  return {
    handle: user.handle,
    wallet: user.wallet,
    display_name: user.displayName,
    bio: user.bio,
    avatar_url: user.avatarUrl,
    league: leagueSlug ?? DEFAULT_LEAGUE_SLUG,
    created_at: user.createdAt.getTime(),
    updated_at: user.updatedAt.getTime(),
    socials: socials.map(socialDto),
  }
}

export function meProfileDto(
  user: UserRow,
  socials: SocialAccount[],
  leagueSlug: string | null,
) {
  return {
    ...publicProfileDto(user, socials, leagueSlug),
    email: user.email,
  }
}
