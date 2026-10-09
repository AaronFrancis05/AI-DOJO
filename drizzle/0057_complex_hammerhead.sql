CREATE TABLE "scenario_goal_native_localizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_goal_id" integer NOT NULL,
	"target_language" varchar(10) NOT NULL,
	"native_language" varchar(10) NOT NULL,
	"goal_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_native_localizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"target_language" varchar(10) NOT NULL,
	"native_language" varchar(10) NOT NULL,
	"title" varchar(120),
	"context" text,
	"learning_goals" text,
	"ai_character_role" varchar(150),
	"user_character_role" varchar(150),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "situation_native_localizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"situation_id" integer NOT NULL,
	"target_language" varchar(10) NOT NULL,
	"native_language" varchar(10) NOT NULL,
	"title" varchar(120),
	"context" text,
	"learning_goals" text,
	"focus_pills" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_native_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"vocabulary_id" integer NOT NULL,
	"target_language" varchar(10) NOT NULL,
	"native_language" varchar(10) NOT NULL,
	"usage_tip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "target_language" SET DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "student_lesson_progress" ALTER COLUMN "target_language" SET DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "student_progress" ALTER COLUMN "target_language" SET DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "preferred_target_language" SET DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "scenario_goal_native_localizations" ADD CONSTRAINT "scenario_goal_native_localizations_scenario_goal_id_scenario_goals_id_fk" FOREIGN KEY ("scenario_goal_id") REFERENCES "public"."scenario_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_native_localizations" ADD CONSTRAINT "scenario_native_localizations_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situation_native_localizations" ADD CONSTRAINT "situation_native_localizations_situation_id_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."situations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_native_notes" ADD CONSTRAINT "vocabulary_native_notes_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scenario_goal_native_localizations_key" ON "scenario_goal_native_localizations" USING btree ("scenario_goal_id","target_language","native_language");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scenario_native_localizations_key" ON "scenario_native_localizations" USING btree ("scenario_id","target_language","native_language");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_situation_native_localizations_key" ON "situation_native_localizations" USING btree ("situation_id","target_language","native_language");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vocabulary_native_notes_key" ON "vocabulary_native_notes" USING btree ("vocabulary_id","target_language","native_language");