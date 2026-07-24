ALTER TABLE "corrections" ADD COLUMN "retry_of_correction_id" integer;--> statement-breakpoint
ALTER TABLE "corrections" ADD COLUMN "is_final_attempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "phase" varchar(20) DEFAULT 'icebreaker' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "icebreaker_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "running_score" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "pending_retry_correction_id" integer;--> statement-breakpoint
ALTER TABLE "vocabulary_encounters" ADD COLUMN "attempt_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "vocabulary_encounters" ADD COLUMN "accuracy_score" integer;--> statement-breakpoint
ALTER TABLE "vocabulary_encounters" ADD COLUMN "phase" varchar(20) DEFAULT 'icebreaker' NOT NULL;