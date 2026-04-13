export type VerifyOk = {
  ok: true
  tcbStatus: string
  rtmr3Hex: string
  reportDataHex: string
  advisoryIds: string[]
}

export type VerifyFailReason =
  | 'malformed_quote'
  | 'verification_failed'
  | 'tcb_unacceptable'
  | 'pubkey_mismatch'
  | 'collateral_unavailable'

export type VerifyFail = {
  ok: false
  reason: VerifyFailReason
  detail?: string
}

export type VerifyResult = VerifyOk | VerifyFail
