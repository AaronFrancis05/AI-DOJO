CREATE TABLE "ai_interviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"queue_slot_id" integer NOT NULL,
	"assessment_id" integer NOT NULL,
	"learner_id" text NOT NULL,
	"target_language" varchar(10) NOT NULL,
	"model" varchar(80) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"learner_turns" integer DEFAULT 0 NOT NULL,
	"transcript" text,
	"vocabulary_score" integer,
	"grammar_score" integer,
	"fluency_score" integer,
	"cultural_score" integer,
	"task_score" integer,
	"expression_appropriateness_score" integer,
	"feedback" text,
	"graded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_interviews_queue_slot_id_unique" UNIQUE("queue_slot_id")
);
--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "examiner" varchar(10) DEFAULT 'tutor' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "ai_interviewer_avatar_id" varchar(40);--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "ai_interviewer_brief" text;--> statement-breakpoint
ALTER TABLE "ai_interviews" ADD CONSTRAINT "ai_interviews_queue_slot_id_assessment_queue_id_fk" FOREIGN KEY ("queue_slot_id") REFERENCES "public"."assessment_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interviews" ADD CONSTRAINT "ai_interviews_assessment_id_assessment_sessions_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interviews" ADD CONSTRAINT "ai_interviews_learner_id_users_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_interviews_assessment" ON "ai_interviews" USING btree ("assessment_id","status");--> statement-breakpoint
CREATE INDEX "idx_ai_interviews_learner" ON "ai_interviews" USING btree ("learner_id");