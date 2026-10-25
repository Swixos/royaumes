CREATE SCHEMA "chronicle";
--> statement-breakpoint
CREATE TABLE "chronicle"."entries" (
	"player_id" text NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"at" bigint NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "entries_player_id_position_pk" PRIMARY KEY("player_id","position")
);
--> statement-breakpoint
CREATE TABLE "chronicle"."expeditions" (
	"game_id" text NOT NULL,
	"player_id" text NOT NULL,
	"host_name" text NOT NULL,
	CONSTRAINT "expeditions_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "chronicle"."offers" (
	"offer_id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"seller_name" text NOT NULL,
	"give" jsonb NOT NULL,
	"want" jsonb NOT NULL,
	"buyer_id" text,
	"buyer_name" text
);
--> statement-breakpoint
CREATE TABLE "chronicle"."raids" (
	"raid_id" text PRIMARY KEY NOT NULL,
	"attacker_id" text NOT NULL,
	"attacker_name" text NOT NULL,
	"target_name" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "entries_player_type_idx" ON "chronicle"."entries" USING btree ("player_id","type");