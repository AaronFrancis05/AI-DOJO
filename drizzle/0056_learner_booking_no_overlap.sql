-- Custom migration: an exclusion constraint cannot be expressed in the Drizzle
-- schema, so this file is written by hand (generated with
-- `drizzle-kit generate --custom`), mirroring 0036_tutor_booking_no_overlap.
--
-- 0036 makes "a tutor is in one place at a time" true. This is the learner's
-- half: one learner cannot hold two overlapping lessons, even with different
-- tutors. app/api/bookings/route.ts checks it first for a friendly 409, and
-- maps this constraint's 23P01 to the same response when two requests race.
--
-- Pre-flight: adding the constraint fails if overlapping bookings already
-- exist, with an unhelpful message. Fail first with a useful one instead.
-- db:migrate runs each file in one transaction, so this aborts cleanly; cancel
-- or reschedule the listed bookings, then re-run.

DO $$
DECLARE
  clash_count integer;
BEGIN
  SELECT count(*) INTO clash_count
  FROM "tutor_bookings" a
  JOIN "tutor_bookings" b
    ON a."learner_id" = b."learner_id"
   AND a."id" < b."id"
   AND a."status" <> 'cancelled'
   AND b."status" <> 'cancelled'
   AND tsrange(a."scheduled_at", a."scheduled_at" + (a."duration_minutes" * INTERVAL '1 minute'))
    && tsrange(b."scheduled_at", b."scheduled_at" + (b."duration_minutes" * INTERVAL '1 minute'));
  IF clash_count > 0 THEN
    RAISE EXCEPTION 'learner_booking_no_overlap: % pair(s) of overlapping learner bookings exist. Cancel or reschedule them, then re-run db:migrate.', clash_count;
  END IF;
END $$;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_learner_no_overlap"
  EXCLUDE USING gist (
    "learner_id" WITH =,
    tsrange("scheduled_at", "scheduled_at" + ("duration_minutes" * INTERVAL '1 minute')) WITH &&
  ) WHERE ("status" <> 'cancelled');
