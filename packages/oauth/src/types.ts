export type OAuthAction = 'link-profile' | 'create-squad'

export interface OAuthStatePayload {
  action: OAuthAction
  args: Record<string, string>
  pkce_verifier: string
  return_to: string
  nonce: string
}

export interface TwitterProfile {
  id: string
  username: string
  name: string | null
  description: string | null
  profile_image_url: string | null
}
