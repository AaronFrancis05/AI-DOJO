CREATE TABLE "audio_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"text" text NOT NULL,
	"lang" varchar(20) NOT NULL,
	"phase" varchar(20) NOT NULL,
	"speaker" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"error" text,
	"audio_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "audio_status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "audio_url" text;--> statement-breakpoint
ALTER TABLE "audio_jobs" ADD CONSTRAINT "audio_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_jobs" ADD CONSTRAINT "audio_jobs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;