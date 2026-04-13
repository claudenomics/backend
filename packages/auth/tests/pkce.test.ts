import { describe, expect, it } from 'vitest'
import { computeChallenge, isWellFormedChallenge, verifyChallenge } from '../src/pkce.js'

describe('pkce', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

  it('computes the RFC 7636 example challenge', () => {
    expect(computeChallenge(verifier)).toBe(expected)
  })

  it('verifies a matching verifier', () => {
    expect(verifyChallenge(verifier, expected)).toBe(true)
  })

  it('rejects a tampered verifier', () => {
    expect(verifyChallenge(verifier + 'x', expected)).toBe(false)
  })

  it('rejects a tampered challenge', () => {
    expect(verifyChallenge(verifier, expected.slice(0, -1) + 'A')).toBe(false)
  })

  it('rejects mismatched lengths without throwing', () => {
    expect(verifyChallenge(verifier, 'short')).toBe(false)
  })

  it('validates well-formed challenges', () => {
    expect(isWellFormedChallenge(expected)).toBe(true)
    expect(isWellFormedChallenge('too-short')).toBe(false)
    expect(isWellFormedChallenge(expected + '=')).toBe(false)
  })
})
