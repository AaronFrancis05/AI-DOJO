CREATE TABLE "assessment_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"learner_id" text NOT NULL,
	"position" integer NOT NULL,
	"state" varchar(20) DEFAULT 'waiting' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"admitted_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "assessment_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tutor_id" integer NOT NULL,
	"course_id" integer,
	"unit_id" integer,
	"title" varchar(150) NOT NULL,
	"description" text,
	"target_language" varchar(10) NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"minutes_per_learner" integer DEFAULT 10 NOT NULL,
	"call_id" varchar(80) NOT NULL,
	"call_type" varchar(30) DEFAULT 'default' NOT NULL,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_sessions_call_id_unique" UNIQUE("call_id")
);
--> statement-breakpoint
CREATE TABLE "class_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_session_id" integer NOT NULL,
	"learner_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'enrolled' NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"attended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tutor_id" integer NOT NULL,
	"course_id" integer,
	"unit_id" integer,
	"title" varchar(150) NOT NULL,
	"description" text,
	"target_language" varchar(10) NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"capacity" integer DEFAULT 12 NOT NULL,
	"call_id" varchar(80) NOT NULL,
	"call_type" varchar(30) DEFAULT 'default' NOT NULL,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"chat_room_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_sessions_call_id_unique" UNIQUE("call_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutor_bookings" RENAME COLUMN "livekit_room_name" TO "call_id";--> statement-breakpoint
ALTER TABLE "tutor_bookings" DROP CONSTRAINT "tutor_bookings_livekit_room_name_unique";--> statement-breakpoint
ALTER TABLE "tutor_evaluations" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN "acknowledged_unit_ids" text;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD COLUMN "call_type" varchar(30) DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_evaluations" ADD COLUMN "assessment_queue_id" integer;--> statement-breakpoint
ALTER TABLE "assessment_queue" ADD CONSTRAINT "assessment_queue_assessment_id_assessment_sessions_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_queue" ADD CONSTRAINT "assessment_queue_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_session_id_class_sessions_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_chat_room_id_chat_rooms_id_fk" FOREIGN KEY ("chat_room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assessment_queue_learner" ON "assessment_queue" USING btree ("assessment_id","learner_id");--> statement-breakpoint
CREATE INDEX "idx_assessment_queue_order" ON "assessment_queue" USING btree ("assessment_id","position");--> statement-breakpoint
CREATE INDEX "idx_assessment_sessions_tutor_scheduled" ON "assessment_sessions" USING btree ("tutor_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_class_enrollment" ON "class_enrollments" USING btree ("class_session_id","learner_id");--> statement-breakpoint
CREATE INDEX "idx_class_enrollments_learner" ON "class_enrollments" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "idx_class_sessions_tutor_scheduled" ON "class_sessions" USING btree ("tutor_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_class_sessions_unit_scheduled" ON "class_sessions" USING btree ("unit_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_created" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "tutor_evaluations" ADD CONSTRAINT "tutor_evaluations_assessment_queue_id_assessment_queue_id_fk" FOREIGN KEY ("assessment_queue_id") REFERENCES "public"."assessment_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_call_id_unique" UNIQUE("call_id");--> statement-breakpoint
ALTER TABLE "tutor_evaluations" ADD CONSTRAINT "tutor_evaluations_assessment_queue_id_unique" UNIQUE("assessment_queue_id");