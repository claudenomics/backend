CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "family_id" uuid NOT NULL,
  "sub" text NOT NULL,
  "wallet" text NOT NULL,
  "email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "replaced_by" uuid,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);

CREATE INDEX IF NOT EXISTS "refresh_tokens_family_idx" ON "refresh_tokens" ("family_id");
CREATE INDEX IF NOT EXISTS "refresh_tokens_sub_idx" ON "refresh_tokens" ("sub");
CREATE INDEX IF NOT EXISTS "refresh_tokens_expires_at_idx" ON "refresh_tokens" ("expires_at");
