import type { LeagueProgress } from '@claudenomics/leagues'
import type { SocialAccount, UserRow } from '@claudenomics/users'

const DEFAULT_LEAGUE_SLUG = 'bronze'

export interface ProfileStanding {
  rank: number | null
  totalBuilders: number
  progress: LeagueProgress
}

function socialDto(s: SocialAccount) {
  return {
    provider: s.provider,
    handle: s.handle,
    connected_at: s.connectedAt.getTime(),
  }
}

function leagueProgressDto(p: LeagueProgress) {
  return {
    current_tokens: p.currentTokens,
    next: p.nextSlug == null ? null : { slug: p.nextSlug, rank: p.nextRank },
    required_tokens: p.requiredTokens,
    tokens_to_next: p.tokensToNext,
  }
}

export function publicProfileDto(
  user: UserRow,
  socials: SocialAccount[],
  leagueSlug: string | null,
  standing: ProfileStanding,
) {
  return {
    handle: user.handle,
    wallet: user.wallet,
    display_name: user.displayName,
    bio: user.bio,
    avatar_url: user.avatarUrl,
    league: leagueSlug ?? DEFAULT_LEAGUE_SLUG,
    rank: standing.rank,
    total_builders: standing.totalBuilders,
    league_progress: leagueProgressDto(standing.progress),
    created_at: user.createdAt.getTime(),
    updated_at: user.updatedAt.getTime(),
    socials: socials.map(socialDto),
  }
}

export function meProfileDto(
  user: UserRow,
  socials: SocialAccount[],
  leagueSlug: string | null,
  standing: ProfileStanding,
) {
  return {
    ...publicProfileDto(user, socials, leagueSlug, standing),
    email: user.email,
  }
}
