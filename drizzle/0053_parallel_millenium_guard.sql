ALTER TABLE "sessions" ADD COLUMN "active_duration_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "abandonment_reason" varchar(40);