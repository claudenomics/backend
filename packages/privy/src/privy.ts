import { PrivyClient, type User } from '@privy-io/server-auth'
import { AppError } from '@claudenomics/auth'

const appId = process.env.PRIVY_APP_ID
const appSecret = process.env.PRIVY_APP_SECRET
if (!appId || !appSecret) {
  throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET are required')
}

export const privy = new PrivyClient(appId, appSecret)

export type VerifiedPrivyUser = {
  did: string
  wallet: string
  email?: string
}

function solanaAddress(user: User): string | null {
  for (const account of user.linkedAccounts) {
    if (account.type === 'wallet' && account.chainType === 'solana') return account.address
  }
  return null
}

export async function verifyAccessToken(token: string): Promise<string> {
  try {
    const { userId } = await privy.verifyAuthToken(token)
    return userId
  } catch (err) {
    throw new AppError('privy_unavailable', (err as Error).message)
  }
}

export async function resolveUser(did: string): Promise<VerifiedPrivyUser> {
  let user: User
  try {
    user = await privy.getUser(did)
  } catch (err) {
    throw new AppError('privy_unavailable', (err as Error).message)
  }

  let wallet = solanaAddress(user)
  if (!wallet) {
    try {
      user = await privy.createWallets({ userId: did, createSolanaWallet: true })
      wallet = solanaAddress(user)
    } catch (err) {
      throw new AppError('wallet_unavailable', (err as Error).message)
    }
  }

  if (!wallet) throw new AppError('wallet_unavailable', 'no solana wallet after provisioning')

  return { did, wallet, email: user.email?.address }
}
