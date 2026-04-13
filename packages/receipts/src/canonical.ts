import { createHash } from 'node:crypto'
import { verify } from '@noble/secp256k1'

export const DOMAIN_SEPARATOR = Buffer.from('claudenomics-receipt-v1\0', 'utf8')
export const MAX_UINT64_SAFE = Number.MAX_SAFE_INTEGER

export type Receipt = {
  wallet: string
  response_id: string
  upstream: string
  model: string
  input_tokens: number
  output_tokens: number
  ts: number
}

export type SignedReceipt = {
  receipt: Receipt
  sig: string
  pubkey: string
  compose_hash: string
  mode: string
}

function requireSafeInt(name: string, n: number): number {
  if (!Number.isFinite(n)) throw new TypeError(`receipt.${name} must be finite`)
  const t = Math.trunc(n)
  if (t < 0) throw new RangeError(`receipt.${name} must be >= 0`)
  if (t > MAX_UINT64_SAFE) throw new RangeError(`receipt.${name} exceeds MAX_SAFE_INTEGER`)
  return t
}

function pushString(parts: Buffer[], s: string): void {
  const b = Buffer.from(s, 'utf8')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(b.length, 0)
  parts.push(len, b)
}

function pushUint64(parts: Buffer[], n: number): void {
  const b = Buffer.alloc(8)
  b.writeBigUInt64BE(BigInt(n), 0)
  parts.push(b)
}

export function canonicalize(r: Receipt, composeHash: string, mode: string): Buffer {
  const input = requireSafeInt('input_tokens', r.input_tokens)
  const output = requireSafeInt('output_tokens', r.output_tokens)
  const ts = requireSafeInt('ts', r.ts)

  const parts: Buffer[] = [DOMAIN_SEPARATOR]
  pushString(parts, r.wallet)
  pushString(parts, r.response_id)
  pushString(parts, r.upstream)
  pushString(parts, r.model)
  pushUint64(parts, input)
  pushUint64(parts, output)
  pushUint64(parts, ts)
  pushString(parts, composeHash)
  pushString(parts, mode)
  return Buffer.concat(parts)
}

export function digest(receipt: Receipt, composeHash: string, mode: string): Buffer {
  return createHash('sha256').update(canonicalize(receipt, composeHash, mode)).digest()
}

const HEX_RE = /^[0-9a-fA-F]+$/
const COMPRESSED_PUBKEY_HEX_LEN = 66
const COMPACT_SIG_HEX_LEN = 128

export function verifySignature(signed: SignedReceipt): boolean {
  if (signed.pubkey.length !== COMPRESSED_PUBKEY_HEX_LEN || !HEX_RE.test(signed.pubkey)) return false
  if (signed.sig.length !== COMPACT_SIG_HEX_LEN || !HEX_RE.test(signed.sig)) return false
  const prefix = signed.pubkey.slice(0, 2).toLowerCase()
  if (prefix !== '02' && prefix !== '03') return false
  try {
    return verify(signed.sig, digest(signed.receipt, signed.compose_hash, signed.mode), signed.pubkey)
  } catch {
    return false
  }
}
