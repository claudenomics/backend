CREATE TABLE "social_accounts" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"handle" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_provider_user_unique" ON "social_accounts" USING btree ("provider","provider_user_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "x_handle";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "github_handle";