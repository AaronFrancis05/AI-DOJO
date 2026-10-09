CREATE TABLE "can_do_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"unit_id" integer NOT NULL,
	"statement_index" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"marked_by_tutor_id" integer,
	"booking_id" integer,
	"confirmed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cefr_placements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" varchar(20) NOT NULL,
	"target_language" varchar(10) NOT NULL,
	"native_language" varchar(10) NOT NULL,
	"model" varchar(80) NOT NULL,
	"status" varchar(20) DEFAULT 'live' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"learner_turns" integer DEFAULT 0 NOT NULL,
	"transcript" text,
	"vocabulary_score" integer,
	"grammar_score" integer,
	"fluency_score" integer,
	"cultural_score" integer,
	"task_score" integer,
	"expression_appropriateness_score" integer,
	"cefr_level" varchar(2),
	"dimension_levels" text,
	"feedback" text,
	"summary" text,
	"graded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"unit_id" integer,
	"lesson_id" integer,
	"plan" text NOT NULL,
	"tutor_edited" boolean DEFAULT false NOT NULL,
	"current_slide" integer DEFAULT 0 NOT NULL,
	"taught_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_plans_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "tutor_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"tutor_id" integer NOT NULL,
	"learner_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_reviews_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
ALTER TABLE "study_packs" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "course_levels" ADD COLUMN "cefr_level" varchar(2);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "target_language" varchar(10);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "hybrid_tutoring_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "study_packs" ADD COLUMN "booking_id" integer;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD COLUMN "unit_id" integer;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD COLUMN "lesson_id" integer;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD COLUMN "lesson_notes" text;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD COLUMN "lesson_corrections" text;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD COLUMN "notes_filed_at" timestamp;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "cefr_level" varchar(2);--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "vetting_placement_id" integer;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "clarity_score" integer;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "trial_lesson_scores" text;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "teaching_module_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "review_flagged_at" timestamp;--> statement-breakpoint
ALTER TABLE "tutors" ADD COLUMN "review_flag_reason" text;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "can_do" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cefr_level" varchar(2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cefr_assessed_at" timestamp;--> statement-breakpoint
ALTER TABLE "can_do_progress" ADD CONSTRAINT "can_do_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "can_do_progress" ADD CONSTRAINT "can_do_progress_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "can_do_progress" ADD CONSTRAINT "can_do_progress_marked_by_tutor_id_tutors_id_fk" FOREIGN KEY ("marked_by_tutor_id") REFERENCES "public"."tutors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "can_do_progress" ADD CONSTRAINT "can_do_progress_booking_id_tutor_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."tutor_bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cefr_placements" ADD CONSTRAINT "cefr_placements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_booking_id_tutor_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."tutor_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_reviews" ADD CONSTRAINT "tutor_reviews_booking_id_tutor_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."tutor_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_reviews" ADD CONSTRAINT "tutor_reviews_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_reviews" ADD CONSTRAINT "tutor_reviews_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_can_do_progress_key" ON "can_do_progress" USING btree ("user_id","unit_id","statement_index");--> statement-breakpoint
CREATE INDEX "idx_cefr_placements_user_purpose" ON "cefr_placements" USING btree ("user_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "idx_tutor_reviews_tutor" ON "tutor_reviews" USING btree ("tutor_id");--> statement-breakpoint
ALTER TABLE "study_packs" ADD CONSTRAINT "study_packs_booking_id_tutor_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."tutor_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutors" ADD CONSTRAINT "tutors_vetting_placement_id_cefr_placements_id_fk" FOREIGN KEY ("vetting_placement_id") REFERENCES "public"."cefr_placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_packs" ADD CONSTRAINT "study_packs_booking_id_unique" UNIQUE("booking_id");