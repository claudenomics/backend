# claudenomics-backend

Auth broker for the [claudenomics CLI](https://github.com/claudenomics/cli).
Brokers Privy login, mints ES256 JWTs binding a Privy user to a Solana
wallet, and publishes a JWKS for the CLI and enclave to verify those JWTs.

See the [backend spec](../claudenomics-cli/BACKEND_SPEC.md) in the CLI repo
for the full contract.

## Stack

- Next.js 14 (App Router, Node runtime)
- TypeScript strict, ESM, Node 20+
- Drizzle ORM + `pg` against Render Postgres
- `jose` for ES256 signing and JWKS export
- `@privy-io/server-auth` server-side + `@privy-io/react-auth` client widget
- `zod` for request validation, `pino` for structured logging
- `vitest` for pure-logic tests

## Endpoints

| method | path | purpose |
|---|---|---|
| GET | `/cli-auth` | Browser-facing. Validates callback, mints opaque `code`, renders Privy login |
| POST | `/api/privy-associate` | Client-only. Resolves Privy user → Solana wallet, attaches to `code` |
| POST | `/api/token` | CLI-facing. Exchanges `{code, code_verifier}` for an ES256 JWT |
| GET | `/.well-known/jwks.json` | Public. JWKS for downstream verification |
| POST | `/api/receipts` | CLI-facing (bearer JWT). Accepts signed enclave receipts, dedups by `response_id`, credits `wallet_totals` |
| GET | `/api/usage/:wallet` | CLI-facing (bearer JWT). Returns `{wallet, input_tokens, output_tokens, last_updated}` for the caller's own wallet |
| POST | `/api/enclave/register` | Enclave-facing. Accepts a DCAP quote, verifies via `@phala/dcap-qvl`, persists `{pubkey, compose_hash, rtmr3, tcb_status}` |

### Deviation from spec

The spec diagram shows an OAuth-style `/privy-callback` redirect. Privy's
primary flow is the React client SDK, not a hosted redirect, so this
backend implements the same external contract via a client-driven
`/api/privy-associate` XHR. CLI behavior is unchanged — loopback still
receives `?code=…&state=…` and `/token` returns the same JSON.

## Local development

```sh
pnpm install
cp .env.example .env
pnpm keygen >> .env
# edit .env: PRIVY_APP_ID, PRIVY_APP_SECRET, NEXT_PUBLIC_PRIVY_APP_ID,
# DATABASE_URL, JWT_ISSUER, PUBLIC_BASE_URL
pnpm db:push
pnpm dev
pnpm test
```

### Generating the JWT signing key

`npm run keygen` generates a fresh ES256 keypair and prints env vars ready
to append to `.env`:

```sh
npm run keygen >> .env
```

Under the hood this is the same as:

```sh
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out key.pem
openssl pkcs8 -topk8 -nocrypt -in key.pem -outform PEM -out key-pkcs8.pem
base64 -i key-pkcs8.pem
```

Do **not** commit `key.pem`. `JWT_PRIVATE_KEY` is a secret — store it in the
host's secrets manager (Vercel env, Render env, etc).

## Privy setup

1. Create an app at https://dashboard.privy.io.
2. Enable login methods you want (wallet, email, social).
3. Enable **Solana** as a chain.
4. Enable **server-side wallet creation** so users without a wallet get one
   provisioned automatically.
5. Copy `App ID` → `PRIVY_APP_ID` and `NEXT_PUBLIC_PRIVY_APP_ID`.
6. Copy `App Secret` → `PRIVY_APP_SECRET` (server only — never expose).

## Render Postgres

1. Provision a Postgres instance on Render.
2. Copy the **External Database URL** and append `?sslmode=require`.
3. Set as `DATABASE_URL` in `.env` (local) and production env.
4. Apply the schema: `pnpm db:push` (pushes `packages/store/src/schema.ts` directly — no migration files committed; generate them with `pnpm db:generate` when you want immutable history).

Render's managed certs chain up to a public CA, so the default Node TLS
validation works without cert pinning.

## Deploy to Vercel

1. `vercel link` the project.
2. Set all env vars from `.env.example` in the Vercel dashboard.
   `JWT_ISSUER` and `PUBLIC_BASE_URL` should be the production URL with no
   trailing slash.
3. Deploy. Node runtime is used for all routes (required for ECDSA + the
   Privy SDK).
4. Apply migrations from your workstation: `DATABASE_URL=<prod> npm run db:push`.
5. Share the URL with the CLI team:
   ```
   CLAUDENOMICS_AUTH_URL=https://<deploy>/cli-auth
   CLAUDENOMICS_JWKS_URL=https://<deploy>/.well-known/jwks.json
   CLAUDENOMICS_JWT_ISSUER=https://<deploy>
   ```

## Key rotation

The JWKS endpoint supports a rotation overlap window out of the box. To
rotate:

1. Generate a new key with `npm run keygen`.
2. Move the current `JWT_PRIVATE_KEY`'s public part to `JWT_OLD_PUBLIC_KEY`
   and its kid to `JWT_OLD_KID`. (Export with
   `openssl ec -in key.pem -pubout -out pub.pem && base64 -i pub.pem`.)
3. Set the new key as `JWT_PRIVATE_KEY` / `JWT_KID`.
4. Redeploy. Both keys are now in `/.well-known/jwks.json`.
5. After `2 × JWT_TTL_SECONDS` (default 2 hours), unset `JWT_OLD_PUBLIC_KEY`
   and `JWT_OLD_KID` and redeploy.

## Receipts protocol

The enclave (runs on Phala TDX, code in the CLI repo at
`packages/enclave/`) signs each LLM response and hands the signed receipt
back to the CLI. The CLI then POSTs it to `/api/receipts` using the user's
JWT.

**Wire format** — `SignedReceipt`:

```json
{
  "receipt": {
    "wallet": "<solana-base58>",
    "response_id": "<unique-id-from-upstream>",
    "upstream": "anthropic | openai",
    "model": "<model-id>",
    "input_tokens": 0,
    "output_tokens": 0,
    "ts": 1744545600000
  },
  "sig": "<128 hex chars: secp256k1 compact r||s>",
  "pubkey": "<66 hex chars: compressed secp256k1>",
  "compose_hash": "<64 hex chars: enclave build hash>"
}
```

**Canonical bytes signed** (must match the enclave exactly; implemented in
`packages/receipts/src/canonical.ts`):

```
"claudenomics-receipt-v1\0"
|| u32be(len(wallet))       || utf8(wallet)
|| u32be(len(response_id))  || utf8(response_id)
|| u32be(len(upstream))     || utf8(upstream)
|| u32be(len(model))        || utf8(model)
|| u64be(input_tokens)
|| u64be(output_tokens)
|| u64be(ts)
```

The signing digest is `SHA-256(canonical_bytes)`, signed with the enclave's
secp256k1 private key derived inside the TEE via `dstack.getKey('receipts')`.

**Backend acceptance checks** (all must pass):

1. `Authorization: Bearer <jwt>` present and verified against our own JWKS.
2. `receipt.wallet` equals the JWT's `wallet` claim (prevents cross-wallet writes).
3. `compose_hash` is in `ALLOWED_COMPOSE_HASHES` (env-configured allowlist of known-good enclave builds).
4. `pubkey` is a well-formed 33-byte compressed secp256k1 key (hex).
5. `sig` verifies against `SHA-256(canonical_bytes)` under `pubkey`.
6. Insert succeeds (or is a no-op on duplicate `response_id`). `wallet_totals` is only credited when the INSERT actually happened; the two writes live in one transaction.

Response: `{"status": "accepted"}` on first submit, `{"status": "duplicate"}` on
replays.

## Attestation (Phase 2 — DCAP)

The backend verifies TDX quotes using
[`@phala/dcap-qvl`](https://github.com/Phala-Network/dcap-qvl), Phala's
pure-JS DCAP quote verification library. This cryptographically binds each
enclave pubkey to a specific TDX VM with a non-revoked TCB.

### Flow

1. **Enclave boot** → enclave derives a secp256k1 keypair via
   `dstack.getKey('receipts')`, requests a TDX quote with the 33-byte
   compressed pubkey packed into `report_data[0..33)`, and POSTs
   `{pubkey, compose_hash, quote}` to `/api/enclave/register`.
2. **Backend verifies** via `@phala/dcap-qvl.getCollateralAndVerify()`,
   fetching Intel collateral from `https://pccs.phala.network` (Phala's
   public PCCS). Checks:
   - Quote signature chains to Intel's production root CA.
   - TCB status ∈ `TCB_ACCEPTED_STATUSES` (default: `UpToDate`).
   - `report_data[0..33)` equals the claimed pubkey.
   - `compose_hash` is in the env allowlist.
3. **Persist** `{pubkey, compose_hash, rtmr3, tcb_status, advisory_ids,
   expires_at = now + ATTESTATION_TTL_SECONDS}` into
   `enclave_attestations`. Upsert on pubkey so re-registration refreshes
   the TTL.
4. **Receipt arrival** → `/api/receipts` looks up the attestation by
   `signed.pubkey`; rejects with `unattested_pubkey` if missing or
   expired; rejects with `unknown_compose_hash` if the receipt's claimed
   `compose_hash` doesn't match the attested one *or* isn't in the env
   allowlist; rejects with `unacceptable_tcb` if the status drifted out
   of policy since registration.

### Trust boundary (v0 vs v1)

**v0 (shipped)**:

- Quote cryptographically binds pubkey ↔ TDX VM ↔ RTMR3.
- `compose_hash` is **claimed** by the enclave at register time; the
  backend trusts the claim and gates it against the env allowlist. The
  quote's RTMR3 is persisted for forensics but not replayed.

**v0 blocks**: fake enclaves without a valid TDX quote, revoked TCBs,
pubkey substitution.

**v0 does not block**: a TDX enclave running attacker code that *claims*
the legit `compose_hash` at register time. Mitigations: the enclave's
code is public, the compose_hash allowlist is operator-controlled, and
attacks require real TDX hardware.

**v1 (future upgrade)**: enclave also emits its dstack event log +
`app-compose.json`. Backend replays
`RTMR3_new = SHA384(RTMR3_old || SHA384(event))` and extracts the
`compose-hash` event, binding `compose_hash` cryptographically to the
quote. At that point the env allowlist becomes the only remaining trust
decision — everything else is math.

### Endpoint contract — `POST /api/enclave/register`

Request:

```json
{
  "pubkey":       "<66 hex chars: compressed secp256k1>",
  "compose_hash": "<64 hex chars>",
  "quote":        "<hex: 2KB–128KB>"
}
```

Response (200):

```json
{ "ok": true, "expiresAt": 1744545600000 }
```

Errors: `invalid_quote` (400), `unknown_compose_hash` (403),
`quote_verification_failed` (401), `unacceptable_tcb` (403),
`pubkey_mismatch` (401), `collateral_unavailable` (503),
`rate_limited` (429).

No auth header required — the quote is self-authenticating. Rate-limited
to 30/min per IP.

## Operational notes

- Auth code store is lazy-GC'd on every `/cli-auth` write. No worker needed.
- Rate limits: `/api/token` 10/min/IP, `/cli-auth` 30/min/IP. State lives
  in the `rate_limits` table; also lazy-GC'd.
- `pg.Pool` is configured with `max: 1` — one connection per Vercel
  function instance. Fine for this endpoint's volume.
- Logs never emit secrets. Redact list lives in `lib/log.ts`.
- Error responses never contain stack traces or URL echoes. Error bodies
  are `{ "error": "<code>" }` where `<code>` is one of the enum values in
  `lib/errors.ts`.

## Open questions

- Privy wallet-creation API naming moves between SDK majors. `lib/privy.ts`
  uses a tolerant shape that accepts both camelCase and snake_case linked
  accounts. Re-verify against your installed `@privy-io/server-auth`
  version before going live.
- Render Postgres cert-pinning is not applied (default Node CA store used
  instead). Revisit if Phase 2 stores PII/receipt signatures.
