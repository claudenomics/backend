import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const hit = vi.fn()
const clientIp = vi.fn()
const getSocialAccountsByUserId = vi.fn()
const getUserByProfileIdentifier = vi.fn()
const ensureUser = vi.fn()
const updateProfile = vi.fn()
const authed = vi.fn()

class MockUserConflictError extends Error {}

vi.mock('@claudenomics/store', () => ({
  hit,
  clientIp,
}))

vi.mock('@claudenomics/users', () => ({
  ensureUser,
  getSocialAccountsByUserId,
  getUserByProfileIdentifier,
  updateProfile,
  UserConflictError: MockUserConflictError,
}))

vi.mock('@/app/lib/request', () => ({
  authed,
}))

let getPublicProfile: typeof import('./[handle]/route.js').GET
let getOwnProfile: typeof import('./me/route.js').GET
let patchOwnProfile: typeof import('./me/route.js').PATCH

beforeAll(async () => {
  ;({ GET: getPublicProfile } = await import('./[handle]/route.js'))
  ;({ GET: getOwnProfile, PATCH: patchOwnProfile } = await import('./me/route.js'))
})

beforeEach(() => {
  vi.clearAllMocks()
  hit.mockResolvedValue({ ok: true })
  clientIp.mockReturnValue('127.0.0.1')
  authed.mockResolvedValue({
    sub: 'did:privy:test',
    wallet: 'So11111111111111111111111111111111111111112',
    email: 'user@example.com',
  })
})

describe('profile routes', () => {
  it('returns a public profile shape compatible with the CLI contract', async () => {
    getUserByProfileIdentifier.mockResolvedValue({
      id: 'user-1',
      privyDid: 'did:privy:test',
      wallet: 'So11111111111111111111111111111111111111112',
      email: 'user@example.com',
      handle: 'builder',
      displayName: 'Builder',
      bio: 'ships product',
      avatarUrl: 'https://example.com/avatar.png',
      currentLeague: 'silver',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    })
    getSocialAccountsByUserId.mockResolvedValue([
      {
        userId: 'user-1',
        provider: 'github',
        providerUserId: '12345',
        handle: 'builderhub',
        connectedAt: new Date('2026-01-03T00:00:00Z'),
      },
    ])

    const res = await getPublicProfile(new Request('https://example.com/api/profile/builder'), {
      params: { handle: 'builder' },
    })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toMatchObject({
      handle: 'builder',
      wallet: 'So11111111111111111111111111111111111111112',
      display_name: 'Builder',
      bio: 'ships product',
      avatar_url: 'https://example.com/avatar.png',
      league: 'silver',
      socials: [
        {
          provider: 'github',
          handle: 'builderhub',
        },
      ],
    })
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('current_league')
    expect(body.socials[0]).not.toHaveProperty('provider_user_id')
  })

  it('rejects empty profile patches before hitting the db layer', async () => {
    const res = await patchOwnProfile(
      new Request('https://example.com/api/profile/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(400)
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('returns a specific conflict when the authenticated wallet is already linked elsewhere', async () => {
    ensureUser.mockRejectedValue(new MockUserConflictError())

    const res = await getOwnProfile(new Request('https://example.com/api/profile/me'))
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'wallet_conflict' })
  })
})
