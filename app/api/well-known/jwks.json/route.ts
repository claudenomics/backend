import { jwks } from '@claudenomics/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const set = await jwks()
    return new Response(JSON.stringify(set), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300',
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'internal' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
