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

const displayNameSchema = z.string().trim().min(1).max(80)
const bioSchema = z.string().trim().min(1).max(280)
const avatarUrlSchema = z.string().trim().max(2048).url()

export const profilePatchBodySchema = z
  .object({
    display_name: displayNameSchema.nullable().optional(),
    bio: bioSchema.nullable().optional(),
    avatar_url: avatarUrlSchema.nullable().optional(),
  })
  .strict()
  .refine(
    body => Object.values(body).some(value => value !== undefined),
    'at least one profile field is required',
  )
export type ProfilePatchBody = z.infer<typeof profilePatchBodySchema>

const squadSlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/)
const squadNameSchema = z.string().trim().min(1).max(80)

const squadTwitterSchema = z
  .object({
    provider_user_id: z.string().trim().min(1).max(64),
    handle: z.string().trim().min(1).max(32),
    display_name: z.string().trim().min(1).max(80).optional(),
    bio: bioSchema.optional(),
    avatar_url: avatarUrlSchema.optional(),
  })
  .strict()

export const createSquadBodySchema = z
  .object({
    slug: squadSlugSchema,
    name: squadNameSchema,
    twitter: squadTwitterSchema,
  })
  .strict()
export type CreateSquadBody = z.infer<typeof createSquadBodySchema>

export const createSquadInviteBodySchema = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    max_uses: z.number().int().positive().max(10_000).optional(),
    expires_at: z.number().int().positive().optional(),
  })
  .strict()
export type CreateSquadInviteBody = z.infer<typeof createSquadInviteBodySchema>

export const acceptInviteBodySchema = z
  .object({
    set_primary: z.boolean().optional(),
  })
  .strict()
export type AcceptInviteBody = z.infer<typeof acceptInviteBodySchema>
