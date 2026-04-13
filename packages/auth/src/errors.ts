export type ErrorCode =
  | 'invalid_request'
  | 'invalid_callback'
  | 'invalid_code'
  | 'state_mismatch'
  | 'verifier_mismatch'
  | 'wallet_unavailable'
  | 'wallet_mismatch'
  | 'privy_unavailable'
  | 'unauthorized'
  | 'invalid_signature'
  | 'unknown_compose_hash'
  | 'compose_hash_drift'
  | 'invalid_quote'
  | 'quote_verification_failed'
  | 'unacceptable_tcb'
  | 'pubkey_mismatch'
  | 'collateral_unavailable'
  | 'unattested_pubkey'
  | 'non_production_receipt'
  | 'rate_limited'
  | 'not_implemented'
  | 'internal'

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  invalid_callback: 400,
  invalid_code: 401,
  state_mismatch: 401,
  verifier_mismatch: 401,
  wallet_unavailable: 401,
  wallet_mismatch: 403,
  privy_unavailable: 503,
  unauthorized: 401,
  invalid_signature: 401,
  unknown_compose_hash: 403,
  compose_hash_drift: 403,
  invalid_quote: 400,
  quote_verification_failed: 401,
  unacceptable_tcb: 403,
  pubkey_mismatch: 401,
  collateral_unavailable: 503,
  unattested_pubkey: 403,
  non_production_receipt: 403,
  rate_limited: 429,
  not_implemented: 501,
  internal: 500,
}

export function errorResponse(code: ErrorCode, retryAfterSeconds?: number): Response {
  const headers: HeadersInit = retryAfterSeconds === undefined
    ? {}
    : { 'retry-after': String(retryAfterSeconds) }
  return Response.json({ error: code }, { status: STATUS[code], headers })
}

export class AppError extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? code)
  }
}
