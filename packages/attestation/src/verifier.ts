import { getCollateralAndVerify, type Report, type VerifiedReport } from '@phala/dcap-qvl'
import { isAcceptableTcb } from './policy.js'
import type { VerifyResult } from './types.js'

const HEX_RE = /^[0-9a-fA-F]+$/
const MIN_QUOTE_BYTES = 1024
const MAX_QUOTE_BYTES = 65536

type TdFields = { rtMr3: Uint8Array; reportData: Uint8Array }

function tdFields(report: Report): TdFields | null {
  const td15 = report.asTd15()
  if (td15) return { rtMr3: td15.base.rtMr3, reportData: td15.base.reportData }
  const td10 = report.asTd10()
  if (td10) return { rtMr3: td10.rtMr3, reportData: td10.reportData }
  return null
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('pccs') ||
    msg.includes('collateral')
  )
}

export async function verifyQuote(
  quoteHex: string,
  expectedPubkeyHex: string,
): Promise<VerifyResult> {
  if (!HEX_RE.test(quoteHex) || quoteHex.length % 2 !== 0) {
    return { ok: false, reason: 'malformed_quote', detail: 'non-hex input' }
  }
  const quoteBytes = Buffer.from(quoteHex, 'hex')
  if (quoteBytes.length < MIN_QUOTE_BYTES || quoteBytes.length > MAX_QUOTE_BYTES) {
    return { ok: false, reason: 'malformed_quote', detail: `quote length ${quoteBytes.length}` }
  }

  let verified: VerifiedReport
  try {
    verified = await getCollateralAndVerify(quoteBytes)
  } catch (err) {
    if (isNetworkError(err)) {
      return { ok: false, reason: 'collateral_unavailable', detail: (err as Error).message }
    }
    return { ok: false, reason: 'verification_failed', detail: (err as Error).message }
  }

  if (!isAcceptableTcb(verified.status)) {
    return { ok: false, reason: 'tcb_unacceptable', detail: verified.status }
  }

  const td = tdFields(verified.report)
  if (!td) {
    return { ok: false, reason: 'malformed_quote', detail: 'quote is not TDX' }
  }

  const expected = expectedPubkeyHex.toLowerCase()
  const reportDataHex = toHex(td.reportData).toLowerCase()
  const pubkeyInReport = reportDataHex.slice(0, expected.length)
  if (pubkeyInReport !== expected) {
    return { ok: false, reason: 'pubkey_mismatch' }
  }
  const tail = reportDataHex.slice(expected.length)
  if (tail.length > 0 && !/^0+$/.test(tail)) {
    return { ok: false, reason: 'malformed_quote', detail: 'report_data tail is non-zero' }
  }

  return {
    ok: true,
    tcbStatus: verified.status,
    rtmr3Hex: toHex(td.rtMr3),
    reportDataHex,
    advisoryIds: verified.advisory_ids,
  }
}
