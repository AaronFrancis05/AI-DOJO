ALTER TABLE "users" ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "xp_to_next" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tier" varchar(20) DEFAULT 'premium' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "streak" integer DEFAULT 0 NOT NULL;