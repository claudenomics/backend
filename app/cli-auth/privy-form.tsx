'use client'

import { PrivyProvider, useLogin, usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'

export default function PrivyForm({ code, appId }: { code: string; appId: string }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['wallet', 'email', 'google'],
        embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' } },
        appearance: { walletChainType: 'solana-only' },
      }}
    >
      <Inner code={code} />
    </PrivyProvider>
  )
}

function Inner({ code }: { code: string }) {
  const { ready, getAccessToken } = usePrivy()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { login } = useLogin({
    onComplete: async () => {
      setBusy(true)
      const accessToken = await getAccessToken()
      if (!accessToken) {
        setBusy(false)
        setError('no access token')
        return
      }
      const res = await fetch('/api/privy-associate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, privyAccessToken: accessToken }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'unknown' }))) as { error: string }
        setBusy(false)
        setError(body.error)
        return
      }
      const { redirectUrl } = (await res.json()) as { redirectUrl: string }
      window.location.replace(redirectUrl)
    },
    onError: err => setError(String(err)),
  })

  if (!ready) return <p>Loading…</p>

  if (error) {
    return (
      <div>
        <p>Sign-in failed.</p>
        <p style={{ color: '#c00' }}>{error}</p>
        <p>Close this tab and re-run <code>claudenomics login</code>.</p>
      </div>
    )
  }

  if (busy) return <p>Finishing sign-in…</p>

  return (
    <button
      onClick={() => login()}
      style={{ padding: '0.75rem 1.25rem', fontSize: 16, cursor: 'pointer' }}
    >
      Sign in
    </button>
  )
}
