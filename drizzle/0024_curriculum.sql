CREATE TABLE "course_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"sequence_order" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text,
	"required_xp" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"target_language" varchar(10) DEFAULT 'ja' NOT NULL,
	"native_language" varchar(10) DEFAULT 'en' NOT NULL,
	"difficulty" varchar(20) DEFAULT 'beginner' NOT NULL,
	"icon" varchar(40),
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lesson_phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"sequence_order" integer NOT NULL,
	"phase_key" varchar(20) NOT NULL,
	"title" varchar(120) NOT NULL,
	"objective" text,
	"duration_minutes" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_id" integer NOT NULL,
	"sequence_order" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"summary" text,
	"scenario_id" integer,
	"estimated_minutes" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"vocabulary_id" integer NOT NULL,
	"state" varchar(20) DEFAULT 'learning' NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"ease_factor" numeric(5, 2) DEFAULT '2.5' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"lapse_count" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp,
	"next_review_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_lesson_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'not_started' NOT NULL,
	"current_phase_key" varchar(20),
	"completed_phases" text,
	"score" integer,
	"best_score" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_id" integer NOT NULL,
	"current_level_id" integer,
	"current_unit_id" integer,
	"current_lesson_id" integer,
	"current_phase_key" varchar(20),
	"lessons_completed" integer DEFAULT 0 NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'not_started' NOT NULL,
	"last_activity_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"level_id" integer NOT NULL,
	"sequence_order" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_levels" ADD CONSTRAINT "course_levels_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_phases" ADD CONSTRAINT "lesson_phases_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lesson_progress" ADD CONSTRAINT "student_lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_lesson_progress" ADD CONSTRAINT "student_lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_progress" ADD CONSTRAINT "student_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_progress" ADD CONSTRAINT "student_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_progress" ADD CONSTRAINT "student_progress_current_level_id_course_levels_id_fk" FOREIGN KEY ("current_level_id") REFERENCES "public"."course_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_progress" ADD CONSTRAINT "student_progress_current_unit_id_units_id_fk" FOREIGN KEY ("current_unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_progress" ADD CONSTRAINT "student_progress_current_lesson_id_lessons_id_fk" FOREIGN KEY ("current_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_level_id_course_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."course_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_course_levels_key" ON "course_levels" USING btree ("course_id","sequence_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lesson_phases_key" ON "lesson_phases" USING btree ("lesson_id","sequence_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lessons_key" ON "lessons" USING btree ("unit_id","sequence_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_srs_cards_key" ON "srs_cards" USING btree ("user_id","vocabulary_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_student_lesson_progress_key" ON "student_lesson_progress" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_student_progress_key" ON "student_progress" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_units_key" ON "units" USING btree ("level_id","sequence_order");