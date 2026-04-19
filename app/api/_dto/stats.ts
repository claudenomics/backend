import type { TokenBreakdown, TokenTotals } from '@claudenomics/receipts'

export type StatsPeriod = 'day' | 'week' | 'month' | 'all'

export const PERIOD_MS: Record<Exclude<StatsPeriod, 'all'>, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
}

const MS_PER_HOUR = 60 * 60 * 1000

export function msToHours(ms: number): number {
  return Math.round((ms / MS_PER_HOUR) * 100) / 100
}

export function statsDto(input: {
  period: StatsPeriod
  since: number | null
  totals: TokenTotals
  models: TokenBreakdown[]
  providers: TokenBreakdown[]
  sessionMs: number
}) {
  return {
    period: input.period,
    since: input.since,
    totals: {
      input_tokens: input.totals.inputTokens,
      output_tokens: input.totals.outputTokens,
      receipt_count: input.totals.receiptCount,
    },
    total_session_hours: msToHours(input.sessionMs),
    models: input.models.map(m => ({
      model: m.key,
      input_tokens: m.inputTokens,
      output_tokens: m.outputTokens,
      receipt_count: m.receiptCount,
    })),
    providers: input.providers.map(p => ({
      upstream: p.key,
      input_tokens: p.inputTokens,
      output_tokens: p.outputTokens,
      receipt_count: p.receiptCount,
    })),
  }
}
