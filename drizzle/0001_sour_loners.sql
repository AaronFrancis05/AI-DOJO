CREATE TABLE "goal_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer,
	"scenario_goal_id" integer,
	"user_id" integer,
	"achieved" boolean DEFAULT true NOT NULL,
	"evidence_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer,
	"sequence_order" integer NOT NULL,
	"goal_text" text NOT NULL,
	"goal_type" varchar(30) NOT NULL,
	"target_phrase_jp" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goal_completions" ADD CONSTRAINT "goal_completions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_completions" ADD CONSTRAINT "goal_completions_scenario_goal_id_scenario_goals_id_fk" FOREIGN KEY ("scenario_goal_id") REFERENCES "public"."scenario_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_completions" ADD CONSTRAINT "goal_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_goals" ADD CONSTRAINT "scenario_goals_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;