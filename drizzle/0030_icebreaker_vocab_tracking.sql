ALTER TABLE "sessions" ADD COLUMN "icebreaker_vocab_index" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "icebreaker_vocab_attempts" integer DEFAULT 0 NOT NULL;