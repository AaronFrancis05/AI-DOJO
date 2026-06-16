CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer,
	"user_id" integer,
	"turn_no" integer NOT NULL,
	"speaker" varchar(20) NOT NULL,
	"message_jp" text NOT NULL,
	"message_romaji" text,
	"message_en" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"scenario_id" integer,
	"vocabulary_score" integer DEFAULT 0 NOT NULL,
	"grammar_score" integer DEFAULT 0 NOT NULL,
	"fluency_score" integer DEFAULT 0 NOT NULL,
	"cultural_score" integer DEFAULT 0 NOT NULL,
	"task_score" integer DEFAULT 0 NOT NULL,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(100) NOT NULL,
	"context" text NOT NULL,
	"business_type" varchar(80) NOT NULL,
	"difficulty" varchar(20) DEFAULT 'beginner' NOT NULL,
	"ai_character_name" varchar(80) NOT NULL,
	"ai_character_role" varchar(120) NOT NULL,
	"user_character_name" varchar(80) NOT NULL,
	"user_character_role" varchar(120) NOT NULL,
	"learning_goals" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(150) NOT NULL,
	"level" varchar(20) DEFAULT 'beginner' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vocabulary" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer,
	"japanese" varchar(200) NOT NULL,
	"romaji" varchar(200) NOT NULL,
	"english" varchar(300) NOT NULL,
	"category" varchar(60) NOT NULL,
	"usage_tip" text,
	"formality_level" varchar(20) DEFAULT 'formal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;