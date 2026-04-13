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

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function StatusLine({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'accent' }) {
  const color = tone === 'accent' ? 'text-accent' : 'text-muted'
  return (
    <div className={`flex items-center gap-2 text-text ${color}`}>
      <Spinner />
      <span>{children}</span>
    </div>
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

  if (!ready) return <StatusLine>Loading…</StatusLine>

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface-card p-5">
          <p className="text-text font-medium mb-1">Sign-in failed</p>
          <p className="text-caption text-muted break-words">{error}</p>
        </div>
        <p className="text-caption text-muted">
          Close this tab and re-run{' '}
          <code className="rounded-md bg-surface-card px-1.5 py-0.5 text-primary">claudenomics login</code>.
        </p>
      </div>
    )
  }

  if (busy) return <StatusLine tone="accent">Finishing sign-in…</StatusLine>

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => login()}
        className="group inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-7 text-[18px] font-semibold text-surface transition-colors hover:bg-accent/90 cursor-pointer"
      >
        Continue with Privy
      </button>
      <p className="text-caption text-dim text-center">
        Wallet · Email · Google
      </p>
    </div>
  )
}
