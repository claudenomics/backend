import { eq, sql } from 'drizzle-orm'
import { db, receipts, walletTotals } from '@claudenomics/store'
import type { SignedReceipt } from './canonical.js'

export type InsertResult = { inserted: boolean }

export async function insertReceipt(
  signed: SignedReceipt,
  attributedSquadId: string | null = null,
): Promise<InsertResult> {
  return db.transaction(async tx => {
    const [row] = await tx
      .insert(receipts)
      .values({
        responseId: signed.receipt.response_id,
        wallet: signed.receipt.wallet,
        upstream: signed.receipt.upstream,
        model: signed.receipt.model,
        inputTokens: signed.receipt.input_tokens,
        outputTokens: signed.receipt.output_tokens,
        ts: signed.receipt.ts,
        composeHash: signed.compose_hash,
        pubkey: signed.pubkey,
        sig: signed.sig,
        attributedSquadId,
      })
      .onConflictDoUpdate({
        target: receipts.responseId,
        set: { responseId: receipts.responseId },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` })

    if (!row?.inserted) return { inserted: false }

    await tx
      .insert(walletTotals)
      .values({
        wallet: signed.receipt.wallet,
        inputTokens: signed.receipt.input_tokens,
        outputTokens: signed.receipt.output_tokens,
      })
      .onConflictDoUpdate({
        target: walletTotals.wallet,
        set: {
          inputTokens: sql`${walletTotals.inputTokens} + ${signed.receipt.input_tokens}`,
          outputTokens: sql`${walletTotals.outputTokens} + ${signed.receipt.output_tokens}`,
          lastUpdated: sql`now()`,
        },
      })

    return { inserted: true }
  })
}

export type WalletTotals = {
  wallet: string
  input_tokens: number
  output_tokens: number
  last_updated: number
}

export async function getTotals(wallet: string): Promise<WalletTotals> {
  const [row] = await db.select().from(walletTotals).where(eq(walletTotals.wallet, wallet)).limit(1)
  if (!row) {
    return { wallet, input_tokens: 0, output_tokens: 0, last_updated: 0 }
  }
  return {
    wallet: row.wallet,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    last_updated: row.lastUpdated.getTime(),
  }
}
