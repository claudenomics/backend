import { z } from 'zod'

export const cliAuthQuerySchema = z.object({
  callback: z.string().url(),
  state: z.string().regex(/^[0-9a-fA-F]{32,64}$/),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal('S256'),
})
export type CliAuthQuery = z.infer<typeof cliAuthQuerySchema>

export const tokenBodySchema = z.object({
  code: z.string().min(16).max(256),
  code_verifier: z.string().regex(/^[A-Za-z0-9_\-.~]{43,128}$/),
})
export type TokenBody = z.infer<typeof tokenBodySchema>

export const privyAssociateBodySchema = z.object({
  code: z.string().min(16).max(256),
  privyAccessToken: z.string().min(1),
})
export type PrivyAssociateBody = z.infer<typeof privyAssociateBodySchema>

export const refreshBodySchema = z.object({
  refresh_token: z.string().regex(/^crn_refresh_[A-Za-z0-9_-]{43}$/),
})
export type RefreshBody = z.infer<typeof refreshBodySchema>

export const revokeBodySchema = z.object({
  refresh_token: z.string().regex(/^crn_refresh_[A-Za-z0-9_-]{43}$/),
})
export type RevokeBody = z.infer<typeof revokeBodySchema>
