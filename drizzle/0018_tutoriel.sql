CREATE SCHEMA "tutorial";
--> statement-breakpoint
CREATE TABLE "tutorial"."expeditions" (
	"game_id" text NOT NULL,
	"player_id" text NOT NULL,
	CONSTRAINT "expeditions_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tutorial"."progress" (
	"player_id" text PRIMARY KEY NOT NULL,
	"levels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deeds" jsonb DEFAULT '[]'::jsonb NOT NULL
);
