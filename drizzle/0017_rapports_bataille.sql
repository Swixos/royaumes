ALTER TABLE "chronicle"."raids" ADD COLUMN "pirates" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chronicle"."raids" ADD COLUMN "ships" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chronicle"."raids" ADD COLUMN "tactic" text DEFAULT 'ram' NOT NULL;--> statement-breakpoint
ALTER TABLE "chronicle"."raids" ADD COLUMN "cost" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "chronicle"."raids" ADD COLUMN "battle" jsonb;