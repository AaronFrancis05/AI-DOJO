CREATE TABLE "user_avatars" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"avatar_url" text NOT NULL,
	"thumbnail_url" text,
	"is_selected" boolean DEFAULT false NOT NULL,
	"source" varchar(20) DEFAULT 'avaturn' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;