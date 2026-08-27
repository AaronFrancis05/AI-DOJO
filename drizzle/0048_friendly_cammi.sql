ALTER TABLE "users" ADD COLUMN "auth_user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_auth_user_id" ON "users" USING btree ("auth_user_id");