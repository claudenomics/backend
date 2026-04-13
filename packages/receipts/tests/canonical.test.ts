import { describe, expect, it } from 'vitest'
import { getPublicKey, signAsync } from '@noble/secp256k1'
import { randomBytes } from 'node:crypto'
import {
  DOMAIN_SEPARATOR,
  canonicalize,
  digest,
  verifySignature,
  type Receipt,
  type SignedReceipt,
} from '../src/canonical.js'

const sample: Receipt = {
  wallet: 'So11111111111111111111111111111111111111112',
  response_id: 'resp_abc123',
  upstream: 'anthropic',
  model: 'claude-sonnet-4-6',
  input_tokens: 1234,
  output_tokens: 567,
  ts: 1_744_545_600_000,
}
const sampleComposeHash = 'a'.repeat(64)
const sampleMode = 'production'

describe('canonicalize', () => {
  it('prefixes with the domain separator', () => {
    const bytes = canonicalize(sample, sampleComposeHash, sampleMode)
    expect(bytes.subarray(0, DOMAIN_SEPARATOR.length).equals(DOMAIN_SEPARATOR)).toBe(true)
  })

  it('matches the hand-computed length-prefixed layout', () => {
    const parts: Buffer[] = [DOMAIN_SEPARATOR]
    for (const s of [sample.wallet, sample.response_id, sample.upstream, sample.model]) {
      const b = Buffer.from(s, 'utf8')
      const len = Buffer.alloc(4)
      len.writeUInt32BE(b.length, 0)
      parts.push(len, b)
    }
    for (const n of [sample.input_tokens, sample.output_tokens, sample.ts]) {
      const b = Buffer.alloc(8)
      b.writeBigUInt64BE(BigInt(n), 0)
      parts.push(b)
    }
    for (const s of [sampleComposeHash, sampleMode]) {
      const b = Buffer.from(s, 'utf8')
      const len = Buffer.alloc(4)
      len.writeUInt32BE(b.length, 0)
      parts.push(len, b)
    }
    const expected = Buffer.concat(parts)
    expect(canonicalize(sample, sampleComposeHash, sampleMode).equals(expected)).toBe(true)
  })

  it('differs for any field change', () => {
    const base = canonicalize(sample, sampleComposeHash, sampleMode).toString('hex')
    expect(canonicalize({ ...sample, wallet: 'other' }, sampleComposeHash, sampleMode).toString('hex')).not.toBe(base)
    expect(canonicalize({ ...sample, response_id: 'x' }, sampleComposeHash, sampleMode).toString('hex')).not.toBe(base)
    expect(canonicalize({ ...sample, input_tokens: sample.input_tokens + 1 }, sampleComposeHash, sampleMode).toString('hex')).not.toBe(base)
    expect(canonicalize({ ...sample, ts: sample.ts + 1 }, sampleComposeHash, sampleMode).toString('hex')).not.toBe(base)
    expect(canonicalize(sample, 'b'.repeat(64), sampleMode).toString('hex')).not.toBe(base)
    expect(canonicalize(sample, sampleComposeHash, 'simulator').toString('hex')).not.toBe(base)
  })

  it('rejects negative or non-finite numbers', () => {
    expect(() => canonicalize({ ...sample, input_tokens: -1 }, sampleComposeHash, sampleMode)).toThrow()
    expect(() => canonicalize({ ...sample, ts: NaN }, sampleComposeHash, sampleMode)).toThrow()
    expect(() => canonicalize({ ...sample, output_tokens: Number.POSITIVE_INFINITY }, sampleComposeHash, sampleMode)).toThrow()
  })
})

describe('verifySignature', () => {
  const composeHash = 'f'.repeat(64)
  const mode = 'production'

  async function sign(receipt: Receipt): Promise<SignedReceipt> {
    const privateKey = randomBytes(32)
    const publicKey = getPublicKey(privateKey, true)
    const sigObj = await signAsync(digest(receipt, composeHash, mode), privateKey)
    return {
      receipt,
      sig: Buffer.from(sigObj.toCompactRawBytes()).toString('hex'),
      pubkey: Buffer.from(publicKey).toString('hex'),
      compose_hash: composeHash,
      mode,
    }
  }

  it('accepts a valid signature', async () => {
    const signed = await sign(sample)
    expect(verifySignature(signed)).toBe(true)
  })

  it('rejects a tampered payload', async () => {
    const signed = await sign(sample)
    signed.receipt = { ...sample, input_tokens: sample.input_tokens + 1 }
    expect(verifySignature(signed)).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const signed = await sign(sample)
    const flipped = signed.sig.slice(0, -2) + (signed.sig.endsWith('0') ? '1' : '0')
    expect(verifySignature({ ...signed, sig: flipped })).toBe(false)
  })

  it('rejects a mismatched pubkey', async () => {
    const signed = await sign(sample)
    const otherPubkey = Buffer.from(getPublicKey(randomBytes(32), true)).toString('hex')
    expect(verifySignature({ ...signed, pubkey: otherPubkey })).toBe(false)
  })

  it('rejects malformed hex', async () => {
    const signed = await sign(sample)
    expect(verifySignature({ ...signed, sig: 'zz' + signed.sig.slice(2) })).toBe(false)
    expect(verifySignature({ ...signed, pubkey: signed.pubkey.slice(0, -2) })).toBe(false)
  })

  it('rejects uncompressed pubkey prefix', async () => {
    const signed = await sign(sample)
    expect(verifySignature({ ...signed, pubkey: '04' + signed.pubkey.slice(2) })).toBe(false)
  })

  it('rejects a relabeled compose_hash', async () => {
    const signed = await sign(sample)
    expect(verifySignature({ ...signed, compose_hash: 'e'.repeat(64) })).toBe(false)
  })

  it('rejects a relabeled mode', async () => {
    const signed = await sign(sample)
    expect(verifySignature({ ...signed, mode: 'simulator' })).toBe(false)
  })
})
