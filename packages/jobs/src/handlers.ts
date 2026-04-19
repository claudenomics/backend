import { recomputeAllLeagues } from '@claudenomics/leagues'

export type JobResult = Record<string, unknown>
export type JobHandler = () => Promise<JobResult>

export const handlers: Record<string, JobHandler> = {
  'leagues.recompute': async () => {
    const { users, squads } = await recomputeAllLeagues()
    return { users, squads }
  },
}

export const DEFAULT_SCHEDULES: Array<{ kind: string; intervalSeconds: number }> = [
  { kind: 'leagues.recompute', intervalSeconds: 600 },
]
