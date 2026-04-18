import { headers } from 'next/headers'
import { cliAuthQuerySchema, isValidCallback } from '@claudenomics/auth'
import { clientIp, createCode, hit } from '@claudenomics/store'
import PrivyForm from './privy-form'
import { ClaudenomicsLogo } from './logo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

const errorMessages: Record<string, string> = {
  misconfigured: 'The service is not configured correctly. Contact support if this persists.',
  invalid_request: 'This login link is malformed or has expired.',
  invalid_callback: 'The callback URL on this link is not allowed.',
  rate_limited: 'Too many attempts from this network. Try again in a minute.',
}

function Toolbar() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-surface/70">
      <div className="flex items-center h-[72px] px-6 max-w-[1280px] mx-auto">
        <a
          href="https://claudenomics.xyz"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="claudenomics home"
          className="font-inter font-bold text-[20px] text-primary inline-flex items-center gap-2 rounded-[6px] touch-manipulation transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
        >
          <ClaudenomicsLogo size={24} />
          <span translate="no">claudenomics</span>
        </a>
      </div>
    </nav>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Toolbar />
      <main className="min-h-[calc(100svh-72px)] flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-[480px] flex flex-col gap-10">{children}</div>
      </main>
    </>
  )
}

function errorPage(code: string) {
  const message = errorMessages[code] ?? 'This login link is invalid.'
  return (
    <Shell>
      <div className="flex flex-col gap-5">
        <h1 className="text-[48px] leading-[1.05] tracking-tight font-semibold text-balance">
          login error
        </h1>
        <p className="text-[24px] leading-[1.35] font-medium text-muted text-pretty">{message}</p>
      </div>
      <p className="text-[20px] leading-[1.5] text-muted text-pretty">
        Re-run{' '}
        <code translate="no" className="font-mono text-accent">
          claudenomics login
        </code>{' '}
        in your terminal.
      </p>
      <p className="text-[14px] leading-[1.5] text-dim">code: {code}</p>
    </Shell>
  )
}

export default async function CliAuthPage({ searchParams }: { searchParams: SearchParams }) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!privyAppId) return errorPage('misconfigured')

  const parsed = cliAuthQuerySchema.safeParse({
    callback: searchParams.callback,
    state: searchParams.state,
    code_challenge: searchParams.code_challenge,
    code_challenge_method: searchParams.code_challenge_method,
  })
  if (!parsed.success) return errorPage('invalid_request')
  if (!isValidCallback(parsed.data.callback)) return errorPage('invalid_callback')

  const rl = await hit(`cli-auth:${clientIp(await headers())}`, 30, 60)
  if (!rl.ok) return errorPage('rate_limited')

  const { code } = await createCode({
    callback: parsed.data.callback,
    state: parsed.data.state,
    codeChallenge: parsed.data.code_challenge,
  })

  return (
    <Shell>
      <div className="flex flex-col gap-5">
        <h1 className="text-[48px] leading-[1.05] tracking-tight font-semibold text-balance">
          sign in
        </h1>
        <p className="text-[24px] leading-[1.35] font-medium text-muted text-pretty">
          Connect your wallet to link the CLI on this machine.
        </p>
      </div>

      <PrivyForm code={code} appId={privyAppId} />

      <p className="text-[14px] leading-[1.5] text-muted text-pretty">
        You&rsquo;ll be returned to your terminal once sign-in completes. Tokens are scoped to this
        device.
      </p>
    </Shell>
  )
}
