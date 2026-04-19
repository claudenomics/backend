CREATE TABLE "squad_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"squad_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'default' NOT NULL,
	"label" text,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "squad_invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "squad_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"squad_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"invite_id" uuid,
	"invited_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "squads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"avatar_url" text,
	"captain_user_id" uuid NOT NULL,
	"current_league" text DEFAULT 'bronze' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "squads_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "squad_invites" ADD CONSTRAINT "squad_invites_squad_id_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_invites" ADD CONSTRAINT "squad_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_memberships" ADD CONSTRAINT "squad_memberships_squad_id_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_memberships" ADD CONSTRAINT "squad_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_memberships" ADD CONSTRAINT "squad_memberships_invite_id_squad_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."squad_invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_memberships" ADD CONSTRAINT "squad_memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "squad_invites_squad_id_idx" ON "squad_invites" USING btree ("squad_id");--> statement-breakpoint
CREATE INDEX "squad_invites_expires_at_idx" ON "squad_invites" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "squad_invites_active_default_unique" ON "squad_invites" USING btree ("squad_id") WHERE "squad_invites"."kind" = 'default' and "squad_invites"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "squad_memberships_squad_id_idx" ON "squad_memberships" USING btree ("squad_id");--> statement-breakpoint
CREATE INDEX "squad_memberships_user_id_idx" ON "squad_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "squad_memberships_active_unique" ON "squad_memberships" USING btree ("squad_id","user_id") WHERE "squad_memberships"."left_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "squad_memberships_active_primary_unique" ON "squad_memberships" USING btree ("user_id") WHERE "squad_memberships"."left_at" is null and "squad_memberships"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "squad_memberships_active_captain_unique" ON "squad_memberships" USING btree ("squad_id") WHERE "squad_memberships"."left_at" is null and "squad_memberships"."role" = 'captain';--> statement-breakpoint
CREATE INDEX "squads_captain_user_id_idx" ON "squads" USING btree ("captain_user_id");--> statement-breakpoint
CREATE INDEX "squads_current_league_idx" ON "squads" USING btree ("current_league");--> statement-breakpoint
CREATE INDEX "squads_visibility_idx" ON "squads" USING btree ("visibility");