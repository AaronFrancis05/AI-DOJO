CREATE TABLE "quick_drills" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain_slug" varchar(40) NOT NULL,
	"prompt_ja" text NOT NULL,
	"prompt_phonetic" text,
	"prompt_en" text NOT NULL,
	"expected_goal" varchar(200),
	"difficulty" varchar(20) DEFAULT 'beginner',
	"language_code" varchar(10) DEFAULT 'ja' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"voice_gender" varchar(10) DEFAULT 'female' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "vocabulary" ALTER COLUMN "romaji" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "response_time_ms" integer;--> statement-breakpoint
ALTER TABLE "evaluations" ADD COLUMN "expression_appropriateness_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "voice_gender" varchar(10) DEFAULT 'female' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "expression_appropriateness_score" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "learning_goal" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_domain_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_mode" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_range" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_goal_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quick_drills_key" ON "quick_drills" USING btree ("language_code","domain_slug","prompt_ja");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_preferred_domain_id_domains_id_fk" FOREIGN KEY ("preferred_domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;