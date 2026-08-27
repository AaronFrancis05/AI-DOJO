CREATE TABLE "calendar_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(160) NOT NULL,
	"notes" text,
	"due_at" timestamp NOT NULL,
	"all_day" boolean DEFAULT true NOT NULL,
	"kind" varchar(20) DEFAULT 'task' NOT NULL,
	"source_lesson_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_tasks" ADD CONSTRAINT "calendar_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_tasks" ADD CONSTRAINT "calendar_tasks_source_lesson_id_lessons_id_fk" FOREIGN KEY ("source_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_calendar_tasks_user_due" ON "calendar_tasks" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_calendar_tasks_user_lesson" ON "calendar_tasks" USING btree ("user_id","source_lesson_id");