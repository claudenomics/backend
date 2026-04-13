import { headers } from 'next/headers'
import { cliAuthQuerySchema, isValidCallback } from '@claudenomics/auth'
import { clientIp, createCode, hit } from '@claudenomics/store'
import PrivyForm from './privy-form'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

const errorMessages: Record<string, string> = {
  misconfigured: 'The service is not configured correctly. Contact support if this persists.',
  invalid_request: 'This login link is malformed or has expired.',
  invalid_callback: 'The callback URL on this link is not allowed.',
  rate_limited: 'Too many attempts from this network. Try again in a minute.',
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen w-full flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">{children}</div>
    </main>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2 mb-10">
      <div className="size-6 rounded-md bg-accent" />
      <span className="text-[15px] font-semibold tracking-tight">claudenomics</span>
    </div>
  )
}

function errorPage(code: string) {
  const message = errorMessages[code] ?? 'This login link is invalid.'
  return (
    <Shell>
      <Brand />
      <h1 className="text-h1 font-semibold tracking-tight mb-3">Login error</h1>
      <p className="text-text text-muted mb-6">{message}</p>
      <p className="text-caption text-muted">
        Re-run <code className="rounded-md bg-surface-card px-1.5 py-0.5 text-primary">claudenomics login</code> from your terminal.
      </p>
      <p className="mt-10 text-caption text-dim">code: {code}</p>
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
      <Brand />
      <h1 className="text-h1 font-semibold tracking-tight mb-3">Sign in to claudenomics</h1>
      <p className="text-text text-muted mb-10">
        Completing this will return you to your terminal.
      </p>
      <PrivyForm code={code} appId={privyAppId} />
    </Shell>
  )
}
