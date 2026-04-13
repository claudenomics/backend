import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalJWKSet, jwtVerify, exportPKCS8, generateKeyPair, exportSPKI } from 'jose'
import { jwks, signToken } from '../src/jwt.js'

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true })
  process.env.JWT_PRIVATE_KEY = Buffer.from(await exportPKCS8(privateKey)).toString('base64')
  process.env.JWT_KID = 'test-key-1'
  process.env.JWT_ISSUER = 'https://auth.test'
  process.env.JWT_AUDIENCE = 'claudenomics'
  delete process.env.JWT_OLD_PUBLIC_KEY
  delete process.env.JWT_OLD_KID
})

describe('jwt', () => {
  it('signs and verifies a round-trip via JWKS', async () => {
    const { token, expiresAt } = await signToken({
      sub: 'did:privy:abc123',
      wallet: 'So11111111111111111111111111111111111111112',
      email: 'user@example.com',
    })
    expect(expiresAt).toBeGreaterThan(Date.now())

    const set = await jwks()
    const keyset = createLocalJWKSet(set)
    const { payload, protectedHeader } = await jwtVerify(token, keyset, {
      issuer: 'https://auth.test',
      audience: 'claudenomics',
    })

    expect(protectedHeader.alg).toBe('ES256')
    expect(protectedHeader.kid).toBe('test-key-1')
    expect(payload.sub).toBe('did:privy:abc123')
    expect(payload.wallet).toBe('So11111111111111111111111111111111111111112')
    expect(payload.email).toBe('user@example.com')
    expect(payload.iss).toBe('https://auth.test')
    expect(payload.aud).toBe('claudenomics')
    expect(typeof payload.jti).toBe('string')
    expect(typeof payload.iat).toBe('number')
    expect(typeof payload.exp).toBe('number')
  })

  it('omits email when not provided', async () => {
    const { token } = await signToken({ sub: 'did:privy:x', wallet: 'Wallet1' })
    const set = await jwks()
    const keyset = createLocalJWKSet(set)
    const { payload } = await jwtVerify(token, keyset, {
      issuer: 'https://auth.test',
      audience: 'claudenomics',
    })
    expect(payload.email).toBeUndefined()
  })

  it('rejects a token signed by a different key', async () => {
    const savedKey = process.env.JWT_PRIVATE_KEY
    const savedKid = process.env.JWT_KID

    const { privateKey } = await generateKeyPair('ES256', { extractable: true })
    process.env.JWT_PRIVATE_KEY = Buffer.from(await exportPKCS8(privateKey)).toString('base64')
    process.env.JWT_KID = 'evil-key'
    const { token } = await signToken({ sub: 'did:privy:evil', wallet: 'EvilWallet' })

    process.env.JWT_PRIVATE_KEY = savedKey
    process.env.JWT_KID = savedKid

    const set = await jwks()
    const keyset = createLocalJWKSet(set)
    await expect(
      jwtVerify(token, keyset, { issuer: 'https://auth.test', audience: 'claudenomics' }),
    ).rejects.toThrow()
  })

  it('publishes the old key in JWKS during rotation', async () => {
    const { publicKey } = await generateKeyPair('ES256', { extractable: true })
    process.env.JWT_OLD_PUBLIC_KEY = Buffer.from(await exportSPKI(publicKey)).toString('base64')
    process.env.JWT_OLD_KID = 'old-key-1'

    const set = await jwks()
    expect(set.keys).toHaveLength(2)
    expect(set.keys.map(k => k.kid).sort()).toEqual(['old-key-1', 'test-key-1'])

    delete process.env.JWT_OLD_PUBLIC_KEY
    delete process.env.JWT_OLD_KID
  })
})
