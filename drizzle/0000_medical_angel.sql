CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"turn_no" integer NOT NULL,
	"speaker" varchar(20) NOT NULL,
	"message_jp" text NOT NULL,
	"message_romaji" text,
	"message_en" text NOT NULL,
	"emotion_tone" varchar(40),
	"gesture_hint" varchar(120),
	"is_english_when_expected" boolean DEFAULT false NOT NULL,
	"is_valid_in_context" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"correction_type" varchar(30) NOT NULL,
	"original_text" text NOT NULL,
	"corrected_text" text NOT NULL,
	"explanation" text NOT NULL,
	"severity" varchar(20) DEFAULT 'minor' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"vocabulary_score" integer DEFAULT 0 NOT NULL,
	"grammar_score" integer DEFAULT 0 NOT NULL,
	"fluency_score" integer DEFAULT 0 NOT NULL,
	"cultural_score" integer DEFAULT 0 NOT NULL,
	"task_score" integer DEFAULT 0 NOT NULL,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "goal_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"conversation_id" integer,
	"scenario_goal_id" integer NOT NULL,
	"achieved" boolean DEFAULT true NOT NULL,
	"evidence_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"sequence_order" integer NOT NULL,
	"goal_text" text NOT NULL,
	"goal_type" varchar(30) NOT NULL,
	"target_phrase_jp" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"context" text NOT NULL,
	"business_type" varchar(80) NOT NULL,
	"difficulty" varchar(20) DEFAULT 'beginner' NOT NULL,
	"domain" varchar(40) DEFAULT 'daily_life' NOT NULL,
	"ai_character_name" varchar(80) NOT NULL,
	"ai_character_role" varchar(150) NOT NULL,
	"user_character_name" varchar(80) NOT NULL,
	"user_character_role" varchar(150) NOT NULL,
	"learning_goals" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"scenario_id" integer NOT NULL,
	"session_number" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"total_turns" integer DEFAULT 0 NOT NULL,
	"vocabulary_score" integer,
	"grammar_score" integer,
	"fluency_score" integer,
	"cultural_score" integer,
	"task_score" integer,
	"feedback" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(150) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"level" varchar(20) DEFAULT 'beginner' NOT NULL,
	"consent_to_data_sharing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vocabulary" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_id" integer NOT NULL,
	"japanese" varchar(200) NOT NULL,
	"romaji" varchar(200) NOT NULL,
	"english" varchar(300) NOT NULL,
	"category" varchar(60) NOT NULL,
	"usage_tip" text,
	"formality_level" varchar(20) DEFAULT 'polite' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_encounters" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"conversation_id" integer,
	"vocabulary_id" integer,
	"used_correctly" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_completions" ADD CONSTRAINT "goal_completions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_completions" ADD CONSTRAINT "goal_completions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_completions" ADD CONSTRAINT "goal_completions_scenario_goal_id_scenario_goals_id_fk" FOREIGN KEY ("scenario_goal_id") REFERENCES "public"."scenario_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_goals" ADD CONSTRAINT "scenario_goals_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_encounters" ADD CONSTRAINT "vocabulary_encounters_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_encounters" ADD CONSTRAINT "vocabulary_encounters_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_encounters" ADD CONSTRAINT "vocabulary_encounters_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE set null ON UPDATE no action;