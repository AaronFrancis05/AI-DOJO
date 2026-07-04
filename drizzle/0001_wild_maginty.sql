CREATE TABLE "share_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "share_tokens_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "share_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;