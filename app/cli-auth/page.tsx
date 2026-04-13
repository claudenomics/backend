import { headers } from 'next/headers'
import { cliAuthQuerySchema, isValidCallback } from '@claudenomics/auth'
import { clientIp, createCode, hit } from '@claudenomics/store'
import PrivyForm from './privy-form'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function errorPage(code: string) {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 560 }}>
      <h1>Login error</h1>
      <p>
        This login link is invalid. Re-run <code>claudenomics login</code> from your terminal.
      </p>
      <p style={{ color: '#888', fontSize: 12 }}>code: {code}</p>
    </main>
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
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 560 }}>
      <h1>Sign in to claudenomics</h1>
      <p>Completing this will return you to your terminal.</p>
      <PrivyForm code={code} appId={privyAppId} />
    </main>
  )
}
