ALTER TABLE "vocabulary" ALTER COLUMN "romaji" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "response_time_ms" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "learning_goal" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_domain_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_mode" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_range" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_goal_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_quick_drills_key" ON "quick_drills" USING btree ("language_code","domain_slug","prompt_ja");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_preferred_domain_id_domains_id_fk" FOREIGN KEY ("preferred_domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;
