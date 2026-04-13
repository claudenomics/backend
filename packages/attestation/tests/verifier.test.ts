import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetCollateralAndVerify = vi.fn()

vi.mock('@phala/dcap-qvl', () => ({
  getCollateralAndVerify: mockGetCollateralAndVerify,
}))

const { verifyQuote } = await import('../src/verifier.js')

const pubkeyHex = '02' + 'ab'.repeat(32)
const rtmr3Bytes = new Uint8Array(48).fill(0xbb)
const rtmr3Hex = Buffer.from(rtmr3Bytes).toString('hex')

function reportDataWithPubkey(pk: string): Uint8Array {
  const out = new Uint8Array(64)
  const bytes = Buffer.from(pk, 'hex')
  out.set(bytes, 0)
  return out
}

function td10(pk: string) {
  return {
    rtMr3: rtmr3Bytes,
    reportData: reportDataWithPubkey(pk),
  }
}

function verifiedReport(status: string, pk: string) {
  return {
    status,
    advisory_ids: [],
    report: {
      asTd15: () => null,
      asTd10: () => td10(pk),
    },
  }
}

function validHexQuote(): string {
  return '00'.repeat(4096)
}

describe('verifyQuote', () => {
  beforeAll(() => {
    process.env.TCB_ACCEPTED_STATUSES = 'UpToDate'
  })

  beforeEach(() => {
    mockGetCollateralAndVerify.mockReset()
  })

  it('accepts a valid UpToDate quote with matching pubkey', async () => {
    mockGetCollateralAndVerify.mockResolvedValue(verifiedReport('UpToDate', pubkeyHex))
    const result = await verifyQuote(validHexQuote(), pubkeyHex)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tcbStatus).toBe('UpToDate')
      expect(result.rtmr3Hex).toBe(rtmr3Hex)
    }
  })

  it('rejects OutOfDate TCB', async () => {
    mockGetCollateralAndVerify.mockResolvedValue(verifiedReport('OutOfDate', pubkeyHex))
    const result = await verifyQuote(validHexQuote(), pubkeyHex)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'tcb_unacceptable' }))
  })

  it('rejects Revoked TCB', async () => {
    mockGetCollateralAndVerify.mockResolvedValue(verifiedReport('Revoked', pubkeyHex))
    const result = await verifyQuote(validHexQuote(), pubkeyHex)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'tcb_unacceptable' }))
  })

  it('rejects when pubkey not in report_data', async () => {
    const otherPubkey = '03' + 'cd'.repeat(32)
    mockGetCollateralAndVerify.mockResolvedValue(verifiedReport('UpToDate', otherPubkey))
    const result = await verifyQuote(validHexQuote(), pubkeyHex)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'pubkey_mismatch' }))
  })

  it('classifies fetch errors as collateral_unavailable', async () => {
    mockGetCollateralAndVerify.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'))
    const result = await verifyQuote(validHexQuote(), pubkeyHex)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'collateral_unavailable' }))
  })

  it('classifies other errors as verification_failed', async () => {
    mockGetCollateralAndVerify.mockRejectedValue(new Error('signature invalid'))
    const result = await verifyQuote(validHexQuote(), pubkeyHex)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'verification_failed' }))
  })

  it('rejects non-hex input without invoking the library', async () => {
    const result = await verifyQuote('not-hex-at-all', pubkeyHex)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'malformed_quote' }))
    expect(mockGetCollateralAndVerify).not.toHaveBeenCalled()
  })

  it('rejects quotes outside the size bounds', async () => {
    const result = await verifyQuote('00'.repeat(100), pubkeyHex)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'malformed_quote' }))
    expect(mockGetCollateralAndVerify).not.toHaveBeenCalled()
  })

  it('rejects SGX reports (only TDX accepted)', async () => {
    mockGetCollateralAndVerify.mockResolvedValue({
      status: 'UpToDate',
      advisory_ids: [],
      report: { asTd15: () => null, asTd10: () => null },
    })
    const result = await verifyQuote(validHexQuote(), pubkeyHex)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'malformed_quote' }))
  })

  it('prefers TDReport15 over TDReport10 when both present', async () => {
    mockGetCollateralAndVerify.mockResolvedValue({
      status: 'UpToDate',
      advisory_ids: ['INTEL-SA-00123'],
      report: {
        asTd15: () => ({ base: td10(pubkeyHex) }),
        asTd10: () => {
          throw new Error('should not be called')
        },
      },
    })
    const result = await verifyQuote(validHexQuote(), pubkeyHex)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.advisoryIds).toEqual(['INTEL-SA-00123'])
      expect(result.rtmr3Hex).toBe(rtmr3Hex)
    }
  })
})
