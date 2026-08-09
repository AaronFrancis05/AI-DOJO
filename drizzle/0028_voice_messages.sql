ALTER TABLE "chat_messages" ADD COLUMN "audio_url" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "audio_mime_type" varchar(40);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "audio_duration_ms" integer;