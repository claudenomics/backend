import { verifyToken, type Claims } from '@claudenomics/auth'

export function bearer(req: Request): string | null {
  const raw = req.headers.get('authorization')
  if (!raw) return null
  const [scheme, token] = raw.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

export async function authed(req: Request): Promise<Claims | null> {
  const token = bearer(req)
  if (!token) return null
  try {
    return await verifyToken(token)
  } catch {
    return null
  }
}
