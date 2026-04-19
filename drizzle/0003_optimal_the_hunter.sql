CREATE TABLE "squad_socials" (
	"squad_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "squad_socials_squad_id_provider_pk" PRIMARY KEY("squad_id","provider")
);
--> statement-breakpoint
DROP INDEX "squads_visibility_idx";--> statement-breakpoint
ALTER TABLE "squad_socials" ADD CONSTRAINT "squad_socials_squad_id_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "squad_socials_provider_user_unique" ON "squad_socials" USING btree ("provider","provider_user_id");--> statement-breakpoint
ALTER TABLE "squads" DROP COLUMN "bio";--> statement-breakpoint
ALTER TABLE "squads" DROP COLUMN "avatar_url";--> statement-breakpoint
ALTER TABLE "squads" DROP COLUMN "visibility";