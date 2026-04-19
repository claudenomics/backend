import { describe, expect, it } from 'vitest'
import { profilePatchBodySchema } from '../src/validate.js'

describe('profilePatchBodySchema', () => {
  it('rejects empty objects', () => {
    expect(profilePatchBodySchema.safeParse({}).success).toBe(false)
  })

  it('trims valid text fields and preserves explicit null clears', () => {
    expect(
      profilePatchBodySchema.parse({
        display_name: '  Builder  ',
        bio: null,
        avatar_url: 'https://example.com/avatar.png',
      }),
    ).toEqual({
      display_name: 'Builder',
      bio: null,
      avatar_url: 'https://example.com/avatar.png',
    })
  })

  it('rejects blank and oversized values', () => {
    expect(profilePatchBodySchema.safeParse({ display_name: '   ' }).success).toBe(false)
    expect(profilePatchBodySchema.safeParse({ bio: 'x'.repeat(281) }).success).toBe(false)
    expect(profilePatchBodySchema.safeParse({ avatar_url: 'notaurl' }).success).toBe(false)
  })
})
