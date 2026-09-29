CREATE TABLE "organization_tutor_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"tutor_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_tutor_permissions" ADD CONSTRAINT "organization_tutor_permissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tutor_permissions" ADD CONSTRAINT "organization_tutor_permissions_tutor_id_tutors_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."tutors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_organization_tutor_permissions" ON "organization_tutor_permissions" USING btree ("organization_id","tutor_id");--> statement-breakpoint
CREATE INDEX "idx_organization_tutor_permissions_tutor" ON "organization_tutor_permissions" USING btree ("tutor_id");