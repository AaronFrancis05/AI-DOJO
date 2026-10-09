ALTER TABLE "class_sessions" RENAME TO "live_lessons";--> statement-breakpoint
ALTER TABLE "class_enrollments" RENAME TO "live_lesson_enrollments";--> statement-breakpoint
ALTER TABLE "live_lesson_enrollments" RENAME COLUMN "class_session_id" TO "live_lesson_id";--> statement-breakpoint
ALTER TABLE "tutor_announcements" RENAME COLUMN "class_session_id" TO "live_lesson_id";--> statement-breakpoint
ALTER SEQUENCE "class_sessions_id_seq" RENAME TO "live_lessons_id_seq";--> statement-breakpoint
ALTER SEQUENCE "class_enrollments_id_seq" RENAME TO "live_lesson_enrollments_id_seq";--> statement-breakpoint
ALTER INDEX "idx_class_sessions_tutor_scheduled" RENAME TO "idx_live_lessons_tutor_scheduled";--> statement-breakpoint
ALTER INDEX "idx_class_sessions_unit_scheduled" RENAME TO "idx_live_lessons_unit_scheduled";--> statement-breakpoint
ALTER INDEX "uq_class_enrollment" RENAME TO "uq_live_lesson_enrollment";--> statement-breakpoint
ALTER INDEX "idx_class_enrollments_learner" RENAME TO "idx_live_lesson_enrollments_learner";--> statement-breakpoint
ALTER TABLE "live_lessons" RENAME CONSTRAINT "class_sessions_call_id_unique" TO "live_lessons_call_id_unique";--> statement-breakpoint
ALTER TABLE "live_lessons" RENAME CONSTRAINT "class_sessions_tutor_id_tutors_id_fk" TO "live_lessons_tutor_id_tutors_id_fk";--> statement-breakpoint
ALTER TABLE "live_lessons" RENAME CONSTRAINT "class_sessions_course_id_courses_id_fk" TO "live_lessons_course_id_courses_id_fk";--> statement-breakpoint
ALTER TABLE "live_lessons" RENAME CONSTRAINT "class_sessions_unit_id_units_id_fk" TO "live_lessons_unit_id_units_id_fk";--> statement-breakpoint
ALTER TABLE "live_lessons" RENAME CONSTRAINT "class_sessions_chat_room_id_chat_rooms_id_fk" TO "live_lessons_chat_room_id_chat_rooms_id_fk";--> statement-breakpoint
ALTER TABLE "live_lesson_enrollments" RENAME CONSTRAINT "class_enrollments_class_session_id_class_sessions_id_fk" TO "live_lesson_enrollments_live_lesson_id_live_lessons_id_fk";--> statement-breakpoint
ALTER TABLE "live_lesson_enrollments" RENAME CONSTRAINT "class_enrollments_learner_id_users_id_fk" TO "live_lesson_enrollments_learner_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "tutor_announcements" RENAME CONSTRAINT "tutor_announcements_class_session_id_class_sessions_id_fk" TO "tutor_announcements_live_lesson_id_live_lessons_id_fk";--> statement-breakpoint
UPDATE "chat_rooms" SET "kind" = 'live_lesson' WHERE "kind" = 'class';--> statement-breakpoint
UPDATE "chat_rooms" SET "audience_key" = regexp_replace("audience_key", '^class\|', 'live_lesson|') WHERE "kind" = 'cohort' AND "audience_key" LIKE 'class|%';--> statement-breakpoint
UPDATE "tutor_announcements" SET "audience_kind" = 'live_lesson' WHERE "audience_kind" = 'class';--> statement-breakpoint
UPDATE "notifications" SET "type" = 'live_lesson' WHERE "type" = 'class';
