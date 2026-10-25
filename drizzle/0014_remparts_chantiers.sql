ALTER TABLE "fleet"."harbors" ADD COLUMN "wall" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet"."harbors" ADD COLUMN "shipyard" jsonb DEFAULT '[]'::jsonb NOT NULL;