import { isAcceptableTcb, lookupAttestation } from '@claudenomics/attestation'
import { AppError, errorResponse, reqLogger, verifyToken } from '@claudenomics/auth'
import {
  insertReceipt,
  signedReceiptSchema,
  verifySignature,
} from '@claudenomics/receipts'
import { hit } from '@claudenomics/store'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_COMPOSE_HASHES = new Set(
  (process.env.ALLOWED_COMPOSE_HASHES ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
)

function bearer(req: Request): string | null {
  const raw = req.headers.get('authorization')
  if (!raw) return null
  const [scheme, token] = raw.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

export async function POST(req: Request) {
  const log = reqLogger(randomUUID())

  const token = bearer(req)
  if (!token) return errorResponse('unauthorized')

  let wallet: string
  try {
    const claims = await verifyToken(token)
    wallet = claims.wallet
  } catch {
    return errorResponse('unauthorized')
  }

  const rl = await hit(`receipts:${wallet}`, 300, 60)
  if (!rl.ok) return errorResponse('rate_limited', rl.retryAfter)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorResponse('invalid_request')
  }
  const parsed = signedReceiptSchema.safeParse(body)
  if (!parsed.success) return errorResponse('invalid_request')

  const signed = parsed.data

  if (signed.receipt.wallet !== wallet) return errorResponse('wallet_mismatch')

  const claimedHash = signed.compose_hash.toLowerCase()
  if (!ALLOWED_COMPOSE_HASHES.has(claimedHash)) {
    log.warn({ event: 'unknown_compose_hash', hash: signed.compose_hash })
    return errorResponse('unknown_compose_hash')
  }

  const attestation = await lookupAttestation(signed.pubkey)
  if (!attestation || attestation.expiresAt < new Date()) {
    log.warn({ event: 'unattested_pubkey', pubkey: signed.pubkey })
    return errorResponse('unattested_pubkey')
  }
  if (attestation.composeHash.toLowerCase() !== claimedHash) {
    log.warn({
      event: 'compose_hash_drift',
      claimed: claimedHash,
      attested: attestation.composeHash,
    })
    return errorResponse('compose_hash_drift')
  }
  if (!isAcceptableTcb(attestation.tcbStatus)) {
    log.warn({ event: 'tcb_unacceptable', status: attestation.tcbStatus })
    return errorResponse('unacceptable_tcb')
  }

  if (!verifySignature(signed)) {
    log.warn({ event: 'invalid_signature', responseId: signed.receipt.response_id })
    return errorResponse('invalid_signature')
  }

  try {
    const { inserted } = await insertReceipt(signed)
    log.info({
      event: inserted ? 'receipt_accepted' : 'receipt_duplicate',
      responseId: signed.receipt.response_id,
    })
    return Response.json({ status: inserted ? 'accepted' : 'duplicate' })
  } catch (err) {
    if (err instanceof AppError) return errorResponse(err.code)
    log.error({ event: 'receipt_insert_failed' })
    return errorResponse('internal')
  }
}
