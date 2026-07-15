ALTER TABLE "conversations" ADD COLUMN "message_target" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "message_native" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "target_language" varchar(10) DEFAULT 'ja' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "native_language" varchar(10) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "native_language" varchar(10) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_target_language" varchar(10) DEFAULT 'ja' NOT NULL;