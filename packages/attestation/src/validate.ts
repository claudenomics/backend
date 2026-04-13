import { z } from 'zod'

export const registerBodySchema = z.object({
  pubkey: z.string().regex(/^[0-9a-fA-F]{66}$/),
  compose_hash: z.string().regex(/^[0-9a-fA-F]{64}$/),
  quote: z.string().regex(/^[0-9a-fA-F]+$/).min(2048).max(131072),
})

export type RegisterBody = z.infer<typeof registerBodySchema>
