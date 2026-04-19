import { createHash, randomBytes } from 'node:crypto'

const AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize'
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const SCOPES = 'tweet.read users.read offline.access'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required`)
  return v
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function buildAuthorizeUrl(input: { state: string; codeChallenge: string }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env('TWITTER_CLIENT_ID'),
    redirect_uri: env('TWITTER_REDIRECT_URI'),
    scope: SCOPES,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export interface TwitterTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
}

export async function exchangeCode(code: string, verifier: string): Promise<TwitterTokenResponse> {
  const clientId = env('TWITTER_CLIENT_ID')
  const clientSecret = env('TWITTER_CLIENT_SECRET')
  const redirectUri = env('TWITTER_REDIRECT_URI')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    client_id: clientId,
  })

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`twitter token exchange failed: ${res.status} ${text}`)
  }
  return (await res.json()) as TwitterTokenResponse
}
