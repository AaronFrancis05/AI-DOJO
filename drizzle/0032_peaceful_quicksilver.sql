CREATE TABLE "scenario_goal_localizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_goal_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"goal_text" text,
	"target_phrase" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenario_goal_localizations" ADD CONSTRAINT "scenario_goal_localizations_scenario_goal_id_scenario_goals_id_fk" FOREIGN KEY ("scenario_goal_id") REFERENCES "public"."scenario_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scenario_goal_localizations_key" ON "scenario_goal_localizations" USING btree ("scenario_goal_id","language_code");