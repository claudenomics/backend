import { z } from 'zod'
import { MAX_UINT64_SAFE } from './canonical.js'

const safeUint = z.number().int().nonnegative().max(MAX_UINT64_SAFE)
const hex = (len: number) => z.string().regex(new RegExp(`^[0-9a-fA-F]{${len}}$`))

export const receiptSchema = z.object({
  wallet: z.string().min(1).max(128),
  response_id: z.string().min(1).max(256),
  upstream: z.string().min(1).max(64),
  model: z.string().min(1).max(128),
  input_tokens: safeUint,
  output_tokens: safeUint,
  ts: safeUint,
})

export const signedReceiptSchema = z.object({
  receipt: receiptSchema,
  sig: hex(128),
  pubkey: hex(66),
  compose_hash: hex(64),
  mode: z.enum(['production', 'simulator']),
})

export type SignedReceiptBody = z.infer<typeof signedReceiptSchema>
