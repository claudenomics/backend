# claudenomics-backend

Auth & usage for the [claudenomics CLI](https://github.com/claudenomics/cli).

A TDX enclave running upstream inference on Phala. The backend mints
ES256 JWTs that bind a Privy to a Solana wallet, verifies TDX
quotes from the enclave, and accepts signed usage receipts that credit
the wallet.

## System

```
      ┌──────────┐        ┌──────────────────┐        ┌───────────┐
      │   CLI    │        │     backend      │        │  enclave  │
      └────┬─────┘        └────────┬─────────┘        └─────┬─────┘
           │                       │                        │
  login    │  open /cli-auth       │                        │
           ├──────────────────────▶│                        │
           │                       │                        │
           │       Privy login + /api/privy-associate       │
           │       attaches wallet to one-time code         │
           │                       │                        │
           │  POST /api/token      │                        │
           │  {code, verifier}     │                        │
           ├──────────────────────▶│                        │
           │◀──────────────────────┤    ES256 JWT           │
           │                       │                        │
  boot     │                       │  POST /api/enclave/register
           │                       │◀───────────────────────┤
           │                       │  verify TDX quote      │
           │                       │  persist pubkey+TCB    │
           │                       │                        │
  inference│                       │      signed receipt    │
           │◀────────────────────── ── ── ── ── ── ── ── ───┤
           │  POST /api/receipts   │                        │
           │  Bearer <jwt>         │                        │
           ├──────────────────────▶│                        │
           │                       │ verify sig ∧ attest    │
           │                       │ credit wallet_totals   │
           │                       │                        │
  usage    │  GET /api/usage/:w    │                        │
           ├──────────────────────▶│                        │
           │                       │                        │
  verify   │  GET /.well-known/jwks.json                    │
           ├──────────────────────▶│                        │
```

## Configuration

All environment variables are declared in `.env.example`.

| name | role |
|---|---|
| `DATABASE_URL` | Postgres connection string (Render external URL + `?sslmode=require`) |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | server-side Privy SDK |
| `NEXT_PUBLIC_PRIVY_APP_ID` | client Privy widget |
| `JWT_PRIVATE_KEY` / `JWT_KID` | active ES256 signing key (base64 PKCS#8) |
| `JWT_OLD_PUBLIC_KEY` / `JWT_OLD_KID` | previous key, served from JWKS during rotation |
| `JWT_ISSUER` / `PUBLIC_BASE_URL` | issuer and origin, no trailing slash |
| `JWT_TTL_SECONDS` | token lifetime (default 3600) |
| `ALLOWED_COMPOSE_HASHES` | comma-separated allowlist of enclave build hashes |
| `TCB_ACCEPTED_STATUSES` | comma-separated TCB statuses accepted at register (default `UpToDate`) |
| `ATTESTATION_TTL_SECONDS` | how long an attestation is honored before re-register |

`pnpm keygen` generates a fresh ES256 keypair and prints the matching
env vars.

## Local development

```sh
pnpm install
cp .env.example .env
pnpm keygen >> .env
# fill in PRIVY_*, DATABASE_URL, JWT_ISSUER, PUBLIC_BASE_URL
pnpm db:push
pnpm dev
pnpm test
```