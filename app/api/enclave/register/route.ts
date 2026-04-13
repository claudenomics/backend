import {
  registerBodySchema,
  upsertAttestation,
  verifyQuote,
} from '@claudenomics/attestation'
import { errorResponse, reqLogger } from '@claudenomics/auth'
import { clientIp, hit } from '@claudenomics/store'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_COMPOSE_HASHES = new Set(
  (process.env.ALLOWED_COMPOSE_HASHES ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
)
function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got '${raw}'`)
  }
  return n
}

const TTL_SECONDS = positiveIntEnv('ATTESTATION_TTL_SECONDS', 604800)

export async function POST(req: Request) {
  const log = reqLogger(randomUUID())

  const rl = await hit(`enclave-register:${clientIp(req.headers)}`, 30, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request')
  }
  const parsed = registerBodySchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  const { pubkey, compose_hash, quote } = parsed.data

  if (!ALLOWED_COMPOSE_HASHES.has(compose_hash.toLowerCase())) {
    log.warn({ event: 'register_unknown_compose', hash: compose_hash })
    return errorResponse('unknown_compose_hash')
  }

  const result = await verifyQuote(quote, pubkey)
  if (!result.ok) {
    log.warn({ event: 'register_verify_failed', reason: result.reason, pubkey })
    switch (result.reason) {
      case 'tcb_unacceptable':
        return errorResponse('unacceptable_tcb')
      case 'pubkey_mismatch':
        return errorResponse('pubkey_mismatch')
      case 'collateral_unavailable':
        return errorResponse('collateral_unavailable')
      case 'malformed_quote':
        return errorResponse('invalid_quote')
      case 'verification_failed':
        return errorResponse('quote_verification_failed')
    }
  }

  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000)
  try {
    await upsertAttestation({
      pubkey,
      composeHash: compose_hash,
      rtmr3: result.rtmr3Hex,
      tcbStatus: result.tcbStatus,
      advisoryIds: result.advisoryIds,
      expiresAt,
    })
  } catch (err) {
    log.error({ event: 'register_persist_failed', err: (err as Error).message })
    return errorResponse('internal')
  }

  log.info({
    event: 'enclave_registered',
    pubkey,
    composeHash: compose_hash,
    tcbStatus: result.tcbStatus,
  })
  return Response.json({ ok: true, expiresAt: expiresAt.getTime() })
}
