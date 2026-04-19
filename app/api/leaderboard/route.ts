import { randomUUID } from 'node:crypto'
import { errorResponse, reqLogger } from '@claudenomics/auth'
import { listLeagues } from '@claudenomics/leagues'
import {
  listSquadSocialsByProvider,
  listSquadsByIds,
} from '@claudenomics/squads'
import { clientIp, hit } from '@claudenomics/store'
import { listUsersByWallets } from '@claudenomics/users'
import { z } from 'zod'
import { PERIOD_MS } from '@/app/api/_dto/stats'
import { builderEntryDto, squadEntryDto } from './dto.js'
import {
  sessionMsByWallets,
  sessionMsBySquads,
} from '@claudenomics/receipts'
import {
  escapeLike,
  providersForSquads,
  providersForWallets,
  rankBuilders,
  rankSquads,
  topModelForSquads,
  topModelForWallets,
  verifiedSquadIds,
  verifiedUserIds,
} from './queries.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  view: z.enum(['builders', 'squads']).default('builders'),
  period: z.enum(['day', 'week', 'month', 'all']).default('all'),
  league: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,31}$/).optional(),
  search: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
})

export async function GET(req: Request) {
  const log = reqLogger(randomUUID())

  const rl = await hit(`leaderboard:${clientIp(req.headers)}`, 120, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    view: url.searchParams.get('view') ?? undefined,
    period: url.searchParams.get('period') ?? undefined,
    league: url.searchParams.get('league') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    page_size: url.searchParams.get('page_size') ?? undefined,
  })
  if (!parsed.success) return errorResponse('invalid_request')

  const { view, period, league, search, page, page_size: pageSize } = parsed.data
  const since = period === 'all' ? undefined : Date.now() - PERIOD_MS[period]
  const searchLike = search ? `%${escapeLike(search)}%` : undefined

  try {
    const leagues = await listLeagues()
    const leagueSlugById = new Map(leagues.map(l => [l.id, l.slug]))
    let leagueId: string | undefined
    if (league) {
      const match = leagues.find(l => l.slug === league)
      if (!match) return errorResponse('invalid_request')
      leagueId = match.id
    }

    if (view === 'builders') {
      const { rows, total } = await rankBuilders({
        since,
        leagueId,
        searchLike,
        page,
        pageSize,
      })
      const wallets = rows.map(r => r.wallet)
      const [users, topModels, providers, sessionMs] = await Promise.all([
        listUsersByWallets(wallets),
        topModelForWallets(wallets, since),
        providersForWallets(wallets, since),
        sessionMsByWallets(wallets, since),
      ])
      const userIds = Array.from(users.values()).map(u => u.id)
      const verified = await verifiedUserIds(userIds)

      const entries = rows.flatMap((row, i) => {
        const user = users.get(row.wallet)
        if (!user) return []
        return [
          builderEntryDto({
            rank: (page - 1) * pageSize + i + 1,
            row,
            user,
            leagueSlug: user.currentLeagueId
              ? leagueSlugById.get(user.currentLeagueId) ?? null
              : null,
            model: topModels.get(row.wallet) ?? null,
            providers: providers.get(row.wallet) ?? [],
            verified: verified.has(user.id),
            sessionMs: sessionMs.get(row.wallet) ?? 0,
          }),
        ]
      })

      return Response.json({
        view,
        period,
        since: since ?? null,
        entries,
        total,
        page,
        page_size: pageSize,
      })
    }

    const { rows, total } = await rankSquads({
      since,
      leagueId,
      searchLike,
      page,
      pageSize,
    })
    const squadIds = rows.map(r => r.squadId)
    const [squadsMap, twitter, topModels, providers, verified, sessionMs] = await Promise.all([
      listSquadsByIds(squadIds),
      listSquadSocialsByProvider(squadIds, 'x'),
      topModelForSquads(squadIds, since),
      providersForSquads(squadIds, since),
      verifiedSquadIds(squadIds),
      sessionMsBySquads(squadIds, since),
    ])

    const entries = rows.flatMap((row, i) => {
      const squad = squadsMap.get(row.squadId)
      if (!squad) return []
      return [
        squadEntryDto({
          rank: (page - 1) * pageSize + i + 1,
          row,
          squad,
          twitter: twitter.get(row.squadId) ?? null,
          leagueSlug: squad.currentLeagueId
            ? leagueSlugById.get(squad.currentLeagueId) ?? null
            : null,
          model: topModels.get(row.squadId) ?? null,
          providers: providers.get(row.squadId) ?? [],
          verified: verified.has(row.squadId),
          sessionMs: sessionMs.get(row.squadId) ?? 0,
        }),
      ]
    })

    return Response.json({
      view,
      period,
      since: since ?? null,
      entries,
      total,
      page,
      page_size: pageSize,
    })
  } catch {
    log.error({ event: 'leaderboard_failed' })
    return errorResponse('internal')
  }
}
