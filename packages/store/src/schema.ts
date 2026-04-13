import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const authCodes = pgTable(
  'auth_codes',
  {
    code: text('code').primaryKey(),
    callback: text('callback').notNull(),
    state: text('state').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    privyDid: text('privy_did'),
    wallet: text('wallet'),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  t => ({
    expiresIdx: index('auth_codes_expires_at_idx').on(t.expiresAt),
  }),
)

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(1),
  },
  t => ({
    pk: primaryKey({ columns: [t.key, t.windowStart] }),
    windowIdx: index('rate_limits_window_idx').on(t.windowStart),
  }),
)

export const receipts = pgTable(
  'receipts',
  {
    responseId: text('response_id').primaryKey(),
    wallet: text('wallet').notNull(),
    upstream: text('upstream').notNull(),
    model: text('model').notNull(),
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull(),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull(),
    ts: bigint('ts', { mode: 'number' }).notNull(),
    composeHash: text('compose_hash').notNull(),
    pubkey: text('pubkey').notNull(),
    sig: text('sig').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  t => ({
    walletTsIdx: index('receipts_wallet_ts_idx').on(t.wallet, t.ts),
  }),
)

export const walletTotals = pgTable('wallet_totals', {
  wallet: text('wallet').primaryKey(),
  inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
  outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
  lastUpdated: timestamp('last_updated', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const enclaveAttestations = pgTable(
  'enclave_attestations',
  {
    pubkey: text('pubkey').primaryKey(),
    composeHash: text('compose_hash').notNull(),
    rtmr3: text('rtmr3').notNull(),
    tcbStatus: text('tcb_status').notNull(),
    advisoryIds: text('advisory_ids').array().notNull().default(sql`'{}'::text[]`),
    verifiedAt: timestamp('verified_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  t => ({
    composeIdx: index('enclave_attestations_compose_idx').on(t.composeHash),
    expiresIdx: index('enclave_attestations_expires_idx').on(t.expiresAt),
  }),
)
