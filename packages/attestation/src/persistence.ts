import { eq, sql } from 'drizzle-orm'
import { db, enclaveAttestations } from '@claudenomics/store'

export type AttestationRow = typeof enclaveAttestations.$inferSelect

export type UpsertArgs = {
  pubkey: string
  composeHash: string
  rtmr3: string
  tcbStatus: string
  advisoryIds: string[]
  expiresAt: Date
}

export async function upsertAttestation(args: UpsertArgs): Promise<void> {
  await db
    .insert(enclaveAttestations)
    .values({
      pubkey: args.pubkey,
      composeHash: args.composeHash,
      rtmr3: args.rtmr3,
      tcbStatus: args.tcbStatus,
      advisoryIds: args.advisoryIds,
      expiresAt: args.expiresAt,
    })
    .onConflictDoUpdate({
      target: enclaveAttestations.pubkey,
      set: {
        composeHash: args.composeHash,
        rtmr3: args.rtmr3,
        tcbStatus: args.tcbStatus,
        advisoryIds: args.advisoryIds,
        verifiedAt: sql`now()`,
        expiresAt: args.expiresAt,
      },
    })
}

export async function lookupAttestation(pubkey: string): Promise<AttestationRow | null> {
  const [row] = await db
    .select()
    .from(enclaveAttestations)
    .where(eq(enclaveAttestations.pubkey, pubkey))
    .limit(1)
  return row ?? null
}
