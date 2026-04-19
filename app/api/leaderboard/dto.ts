import type { SquadRow, SquadSocialRow } from '@claudenomics/squads'
import type { UserRow } from '@claudenomics/users'
import { msToHours } from '@/app/api/_dto/stats'

const DEFAULT_LEAGUE_SLUG = 'bronze'

export type LeaderboardView = 'builders' | 'squads'

interface BaseEntry {
  rank: number
  handle: string
  name: string | null
  avatar_url: string | null
  verified: boolean
  league: string
  tokens_burned: number
  input_tokens: number
  output_tokens: number
  receipt_count: number
  model: string | null
  providers: string[]
  tokens_mined: number
  total_session_hours: number
  spend_series: number[]
}

export interface BuilderEntryInput {
  rank: number
  row: { wallet: string; inputTokens: number; outputTokens: number; receiptCount: number }
  user: UserRow
  leagueSlug: string | null
  model: string | null
  providers: string[]
  verified: boolean
  sessionMs: number
}

export function builderEntryDto(input: BuilderEntryInput): BaseEntry {
  const { row, user, rank, leagueSlug, model, providers, verified, sessionMs } = input
  return {
    rank,
    handle: user.handle,
    name: user.displayName,
    avatar_url: user.avatarUrl,
    verified,
    league: leagueSlug ?? DEFAULT_LEAGUE_SLUG,
    tokens_burned: row.inputTokens + row.outputTokens,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    receipt_count: row.receiptCount,
    model,
    providers,
    tokens_mined: 0,
    total_session_hours: msToHours(sessionMs),
    spend_series: [],
  }
}

export interface SquadEntryInput {
  rank: number
  row: { squadId: string; inputTokens: number; outputTokens: number; receiptCount: number }
  squad: SquadRow
  twitter: SquadSocialRow | null
  leagueSlug: string | null
  model: string | null
  providers: string[]
  verified: boolean
  sessionMs: number
}

export function squadEntryDto(input: SquadEntryInput): BaseEntry {
  const { row, squad, twitter, rank, leagueSlug, model, providers, verified, sessionMs } = input
  return {
    rank,
    handle: squad.slug,
    name: squad.name,
    avatar_url: twitter?.avatarUrl ?? null,
    verified,
    league: leagueSlug ?? DEFAULT_LEAGUE_SLUG,
    tokens_burned: row.inputTokens + row.outputTokens,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    receipt_count: row.receiptCount,
    model,
    providers,
    tokens_mined: 0,
    total_session_hours: msToHours(sessionMs),
    spend_series: [],
  }
}
