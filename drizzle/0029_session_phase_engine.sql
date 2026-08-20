ALTER TABLE "sessions" ALTER COLUMN "phase" SET DEFAULT 'orientation';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "stalled_turn_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "completion_acknowledged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_active_at" timestamp DEFAULT now() NOT NULL;