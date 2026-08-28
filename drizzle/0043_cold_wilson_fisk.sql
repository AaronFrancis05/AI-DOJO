CREATE TABLE "languages" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"native_name" varchar(60) NOT NULL,
	"flag" varchar(8) DEFAULT '🌐' NOT NULL,
	"stt_bcp47" varchar(20) NOT NULL,
	"tts_bcp47" varchar(20) NOT NULL,
	"azure_voice_female" varchar(80) NOT NULL,
	"azure_voice_male" varchar(80) NOT NULL,
	"has_phonetic" boolean DEFAULT false NOT NULL,
	"tts_supported" boolean DEFAULT true NOT NULL,
	"greeting_gesture" varchar(10),
	"is_target_enabled" boolean DEFAULT true NOT NULL,
	"is_native_enabled" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tutor_id" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"target_language" varchar(10),
	"instruction_language" varchar(10),
	"audience_kind" varchar(20) NOT NULL,
	"class_session_id" integer,
	"course_id" integer,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "instruction_language" varchar(10);--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "kind" varchar(20) DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "owner_tutor_id" integer;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD COLUMN "instruction_language" varchar(10);--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "situations" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD COLUMN "instruction_language" varchar(10);--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "instruction_languages" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "tutor_announcements" ADD CONSTRAINT "tutor_announcements_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_announcements" ADD CONSTRAINT "tutor_announcements_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_announcements" ADD CONSTRAINT "tutor_announcements_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tutor_announcements_tutor_created" ON "tutor_announcements" USING btree ("tutor_id","created_at");--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_owner_tutor_id_tutors_id_fk" FOREIGN KEY ("owner_tutor_id") REFERENCES "public"."tutors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_rooms_owner_kind" ON "chat_rooms" USING btree ("owner_tutor_id","kind");