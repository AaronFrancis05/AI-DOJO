DROP INDEX "uq_student_lesson_progress_key";--> statement-breakpoint
DROP INDEX "uq_student_progress_key";--> statement-breakpoint
ALTER TABLE "student_lesson_progress" ADD COLUMN "target_language" varchar(10) DEFAULT 'ja' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN "target_language" varchar(10) DEFAULT 'ja' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progress" ADD COLUMN "native_language" varchar(10) DEFAULT 'en' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_student_lesson_progress_key" ON "student_lesson_progress" USING btree ("user_id","lesson_id","target_language");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_student_progress_key" ON "student_progress" USING btree ("user_id","course_id","target_language");--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "target_language";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "native_language";