CREATE TABLE "situation_localizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"situation_id" integer NOT NULL,
	"language_code" varchar(10) NOT NULL,
	"title" varchar(120),
	"context" text,
	"learning_goals" text,
	"focus_pills" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "situation_localizations" ADD CONSTRAINT "situation_localizations_situation_id_situations_id_fk" FOREIGN KEY ("situation_id") REFERENCES "public"."situations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_situation_localizations_key" ON "situation_localizations" USING btree ("situation_id","language_code");