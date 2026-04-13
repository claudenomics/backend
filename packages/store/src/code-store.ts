import { randomBytes } from 'node:crypto'
import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db } from './db.js'
import { authCodes } from './schema.js'

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got '${raw}'`)
  }
  return n
}

const CODE_TTL_SECONDS = positiveIntEnv('CODE_TTL_SECONDS', 120)
const CODE_GC_GRACE_SECONDS = positiveIntEnv('CODE_GC_GRACE_SECONDS', 24 * 60 * 60)

export type AuthCodeRow = typeof authCodes.$inferSelect

async function lazyGc(): Promise<void> {
  await db
    .delete(authCodes)
    .where(lt(authCodes.expiresAt, sql`now() - make_interval(secs => ${CODE_GC_GRACE_SECONDS})`))
}

export async function createCode(input: {
  callback: string
  state: string
  codeChallenge: string
}): Promise<{ code: string; expiresAt: Date }> {
  const code = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000)

  await db.insert(authCodes).values({
    code,
    callback: input.callback,
    state: input.state,
    codeChallenge: input.codeChallenge,
    expiresAt,
  })

  await lazyGc().catch(() => {})

  return { code, expiresAt }
}

export async function associate(
  code: string,
  data: { privyDid: string; wallet: string; email?: string },
): Promise<AuthCodeRow | null> {
  const [row] = await db
    .update(authCodes)
    .set({ privyDid: data.privyDid, wallet: data.wallet, email: data.email })
    .where(
      and(
        eq(authCodes.code, code),
        isNull(authCodes.consumedAt),
        isNull(authCodes.privyDid),
        sql`${authCodes.expiresAt} > now()`,
      ),
    )
    .returning()
  return row ?? null
}

export async function consume(code: string): Promise<AuthCodeRow | null> {
  const [row] = await db
    .update(authCodes)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(authCodes.code, code),
        isNull(authCodes.consumedAt),
        sql`${authCodes.expiresAt} > now()`,
      ),
    )
    .returning()
  return row ?? null
}
