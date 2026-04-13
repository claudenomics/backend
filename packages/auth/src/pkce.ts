import { createHash, timingSafeEqual } from 'node:crypto'

export function computeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function verifyChallenge(verifier: string, storedChallenge: string): boolean {
  const a = Buffer.from(computeChallenge(verifier))
  const b = Buffer.from(storedChallenge)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/

export function isWellFormedChallenge(s: string): boolean {
  return CHALLENGE_RE.test(s)
}
