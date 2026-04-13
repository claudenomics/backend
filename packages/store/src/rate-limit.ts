import { lt, sql } from 'drizzle-orm'
import { db } from './db.js'
import { rateLimits } from './schema.js'

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

const GC_GRACE_SECONDS = Number.parseInt(process.env.RATE_LIMIT_GC_GRACE_SECONDS ?? '3600', 10)
const TRUST_FORWARDED_FOR = process.env.TRUST_FORWARDED_FOR === '1'

let warnedTrustMissing = false

async function lazyGc(): Promise<void> {
  if (!Number.isFinite(GC_GRACE_SECONDS) || GC_GRACE_SECONDS <= 0) return
  await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, sql`now() - make_interval(secs => ${GC_GRACE_SECONDS})`))
}

export async function hit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStartMs = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000
  const windowStart = new Date(windowStartMs)

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count })

  if (!row) throw new Error('rate_limit upsert returned no row')

  lazyGc().catch(() => {})

  if (row.count <= limit) return { ok: true }

  const retryAfter = Math.max(1, Math.ceil((windowStartMs + windowSeconds * 1000 - now) / 1000))
  return { ok: false, retryAfter }
}

export function clientIp(headers: Headers): string {
  if (TRUST_FORWARDED_FOR) {
    const fwd = headers.get('x-forwarded-for')
    if (fwd) {
      const first = fwd.split(',')[0]?.trim()
      if (first) return first
    }
    const real = headers.get('x-real-ip')?.trim()
    if (real) return real
  } else if (!warnedTrustMissing) {
    warnedTrustMissing = true
    process.stderr.write(
      'rate-limit: TRUST_FORWARDED_FOR=1 not set; per-IP rate limits will bucket all traffic together. Set only when deployed behind a trusted edge (Vercel, Render, Cloudflare).\n',
    )
  }
  return 'unknown'
}
