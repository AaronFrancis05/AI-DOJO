CREATE TABLE "domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(40) NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" text NOT NULL,
	"icon" varchar(40) NOT NULL,
	"hero_gradient_from" varchar(20) NOT NULL,
	"hero_gradient_to" varchar(20) NOT NULL,
	"situation_count" integer DEFAULT 0 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domains_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "situations" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain_id" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"context" text NOT NULL,
	"skill_level" varchar(20) DEFAULT 'beginner' NOT NULL,
	"behavior_mode" varchar(20) DEFAULT 'standard' NOT NULL,
	"learning_goals" text NOT NULL,
	"focus_pills" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"role" varchar(150) NOT NULL,
	"personality" text NOT NULL,
	"avatar_color" varchar(20) NOT NULL,
	"avatar_icon" varchar(40) NOT NULL,
	"voice_type" varchar(80) NOT NULL,
	"default_for_domain_id" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "situation_id" integer;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "situation_id" integer;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "character_id" integer;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "behavior_mode" varchar(20) DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
ALTER TABLE "situations" ADD CONSTRAINT "situations_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_default_for_domain_id_domains_id_fk" FOREIGN KEY ("default_for_domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_situation_id_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."situations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_situation_id_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."situations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;
