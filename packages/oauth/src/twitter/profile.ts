import type { TwitterProfile } from '../types.js'

const ME_URL =
  'https://api.twitter.com/2/users/me?user.fields=id,username,name,description,profile_image_url'

interface MeResponse {
  data?: {
    id: string
    username: string
    name?: string
    description?: string
    profile_image_url?: string
  }
}

export async function fetchProfile(accessToken: string): Promise<TwitterProfile> {
  const res = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`twitter users/me failed: ${res.status} ${text}`)
  }
  const body = (await res.json()) as MeResponse
  if (!body.data?.id || !body.data.username) {
    throw new Error('twitter users/me missing id or username')
  }
  return {
    id: body.data.id,
    username: body.data.username,
    name: body.data.name ?? null,
    description: body.data.description ?? null,
    profile_image_url: body.data.profile_image_url ?? null,
  }
}
