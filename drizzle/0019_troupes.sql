ALTER TABLE "fleet"."raids" ALTER COLUMN "tactic" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet"."harbors" ADD COLUMN "units" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet"."raids" ADD COLUMN "army" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet"."raids" ADD COLUMN "damage" text;--> statement-breakpoint
ALTER TABLE "fleet"."raids" ADD COLUMN "returns_at" bigint DEFAULT 0 NOT NULL;