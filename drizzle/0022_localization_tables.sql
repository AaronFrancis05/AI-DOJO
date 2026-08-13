CREATE TABLE "scenario_localizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"title" varchar(120),
	"context" text,
	"learning_goals" text,
	"ai_character_name" varchar(80),
	"ai_character_role" varchar(150),
	"user_character_name" varchar(80),
	"user_character_role" varchar(150),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_localizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"vocabulary_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"translation" varchar(300),
	"usage_tip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenario_localizations" ADD CONSTRAINT "scenario_localizations_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_localizations" ADD CONSTRAINT "vocabulary_localizations_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scenario_localizations_key" ON "scenario_localizations" USING btree ("scenario_id","language_code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vocabulary_localizations_key" ON "vocabulary_localizations" USING btree ("vocabulary_id","language_code");