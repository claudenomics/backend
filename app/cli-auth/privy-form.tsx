'use client'

import { PrivyProvider, useLogin, usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'
import { CopyCode } from './copy-code'

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

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function ArrowRight({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="transition-transform group-hover:translate-x-1"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function StatusLine({ title, tone = 'muted' }: { title: string; tone?: 'muted' | 'accent' }) {
  const color = tone === 'accent' ? 'text-accent' : 'text-muted'
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-3 text-[20px] ${color}`}>
      <Spinner />
      <span className="font-medium">{title}</span>
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

  if (!ready) return <StatusLine title="Loading…" />

  if (error) {
    return (
      <div role="alert" className="flex flex-col gap-3">
        <p className="text-[20px] leading-[1.4] font-medium text-danger">Sign-in failed</p>
        <p className="text-[14px] leading-[1.5] text-muted break-words">{error}</p>
        <p className="text-[14px] leading-[1.5] text-muted text-pretty">
          Close this tab and re-run <CopyCode>claudenomics login</CopyCode>.
        </p>
      </div>
    )
  }

  if (busy) return <StatusLine title="Finishing sign-in…" tone="accent" />

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => login()}
        style={{ WebkitTapHighlightColor: 'transparent' }}
        className="group inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-7 text-[20px] font-semibold text-surface touch-manipulation transition-colors hover:bg-accent/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
      >
        Continue with Privy
        <ArrowRight />
      </button>
      <p className="text-[14px] leading-[1.5] text-muted text-center">
        Wallet · Email · Google
      </p>
    </div>
  )
}
