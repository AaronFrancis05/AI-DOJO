CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"route" varchar(60) NOT NULL,
	"provider" varchar(30) NOT NULL,
	"model" varchar(100) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_weak_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_language" varchar(10) NOT NULL,
	"category" varchar(20) NOT NULL,
	"pattern" varchar(120) NOT NULL,
	"example" text,
	"count" integer DEFAULT 1 NOT NULL,
	"clean_session_count" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_pack_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"pack_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"kind" varchar(20) NOT NULL,
	"sequence_order" integer NOT NULL,
	"weak_point_id" integer,
	"payload" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_packs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" integer NOT NULL,
	"target_language" varchar(10) NOT NULL,
	"native_language" varchar(10) NOT NULL,
	"explanation" text NOT NULL,
	"recommended_scenario_id" integer,
	"recommendation_reason" text,
	"status" varchar(20) DEFAULT 'ready' NOT NULL,
	"opened_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "study_packs_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "srs_cards" ALTER COLUMN "vocabulary_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_tasks" ADD COLUMN "source_study_pack_id" integer;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD COLUMN "card_type" varchar(20) DEFAULT 'vocab' NOT NULL;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD COLUMN "study_pack_item_id" integer;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD COLUMN "payload" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "occupation" varchar(80);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "interests" text;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_weak_points" ADD CONSTRAINT "learner_weak_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_pack_items" ADD CONSTRAINT "study_pack_items_pack_id_study_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."study_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_pack_items" ADD CONSTRAINT "study_pack_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_pack_items" ADD CONSTRAINT "study_pack_items_weak_point_id_learner_weak_points_id_fk" FOREIGN KEY ("weak_point_id") REFERENCES "public"."learner_weak_points"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_packs" ADD CONSTRAINT "study_packs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_packs" ADD CONSTRAINT "study_packs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_packs" ADD CONSTRAINT "study_packs_recommended_scenario_id_scenarios_id_fk" FOREIGN KEY ("recommended_scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_usage_user_created" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_learner_weak_points_key" ON "learner_weak_points" USING btree ("user_id","target_language","category","pattern");--> statement-breakpoint
CREATE INDEX "idx_learner_weak_points_user_seen" ON "learner_weak_points" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_study_pack_items_pack" ON "study_pack_items" USING btree ("pack_id","sequence_order");--> statement-breakpoint
CREATE INDEX "idx_study_packs_user_created" ON "study_packs" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "calendar_tasks" ADD CONSTRAINT "calendar_tasks_source_study_pack_id_study_packs_id_fk" FOREIGN KEY ("source_study_pack_id") REFERENCES "public"."study_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_study_pack_item_id_study_pack_items_id_fk" FOREIGN KEY ("study_pack_item_id") REFERENCES "public"."study_pack_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_scenarios_owner" ON "scenarios" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_srs_cards_pack_item" ON "srs_cards" USING btree ("user_id","study_pack_item_id");