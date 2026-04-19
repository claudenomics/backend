CREATE TABLE "auth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"callback" text NOT NULL,
	"state" text NOT NULL,
	"code_challenge" text NOT NULL,
	"privy_did" text,
	"wallet" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "enclave_attestations" (
	"pubkey" text PRIMARY KEY NOT NULL,
	"compose_hash" text NOT NULL,
	"rtmr3" text NOT NULL,
	"tcb_status" text NOT NULL,
	"advisory_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"response_id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"upstream" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"ts" bigint NOT NULL,
	"compose_hash" text NOT NULL,
	"pubkey" text NOT NULL,
	"sig" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
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
--> statement-breakpoint
CREATE TABLE "wallet_totals" (
	"wallet" text PRIMARY KEY NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"privy_did" text NOT NULL,
	"wallet" text NOT NULL,
	"email" text,
	"handle" text NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"x_handle" text,
	"github_handle" text,
	"current_league" text DEFAULT 'bronze' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_privy_did_unique" UNIQUE("privy_did"),
	CONSTRAINT "users_wallet_unique" UNIQUE("wallet"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE INDEX "auth_codes_expires_at_idx" ON "auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "enclave_attestations_compose_idx" ON "enclave_attestations" USING btree ("compose_hash");--> statement-breakpoint
CREATE INDEX "enclave_attestations_expires_idx" ON "enclave_attestations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "receipts_wallet_ts_idx" ON "receipts" USING btree ("wallet","ts");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_sub_idx" ON "refresh_tokens" USING btree ("sub");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_current_league_idx" ON "users" USING btree ("current_league");