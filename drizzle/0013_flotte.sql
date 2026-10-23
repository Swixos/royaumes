CREATE SCHEMA "fleet";
--> statement-breakpoint
CREATE TABLE "fleet"."harbors" (
	"player_id" text PRIMARY KEY NOT NULL,
	"village_name" text NOT NULL,
	"upgrades" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleet"."raids" (
	"raid_id" text PRIMARY KEY NOT NULL,
	"attacker_id" text NOT NULL,
	"attacker_name" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"target_name" text NOT NULL,
	"ships" integer NOT NULL,
	"tactic" text NOT NULL,
	"status" text NOT NULL,
	"launched_at" bigint NOT NULL,
	"sailed_at" bigint DEFAULT 0 NOT NULL,
	"arrives_at" bigint DEFAULT 0 NOT NULL,
	"victory" boolean,
	"loot" jsonb
);
--> statement-breakpoint
CREATE INDEX "raids_attacker_idx" ON "fleet"."raids" USING btree ("attacker_id");--> statement-breakpoint
CREATE INDEX "raids_target_idx" ON "fleet"."raids" USING btree ("target_id");