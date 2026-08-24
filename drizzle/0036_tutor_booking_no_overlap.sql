-- Custom migration: an exclusion constraint cannot be expressed in the Drizzle
-- schema, so this file is written by hand (generated with
-- `drizzle-kit generate --custom`) rather than derived from src/schema.ts.
--
-- The application already rejects an overlapping slot before inserting, but
-- that check and the insert are two statements: two learners booking the same
-- slot at the same moment both pass it. This constraint is what actually makes
-- "a tutor is in one place at a time" true. app/api/bookings/route.ts maps the
-- resulting 23P01 to the same 409 the read-side check returns.

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "tutor_bookings" ADD CONSTRAINT "tutor_bookings_no_overlap"
  EXCLUDE USING gist (
    "tutor_id" WITH =,
    tsrange("scheduled_at", "scheduled_at" + ("duration_minutes" * INTERVAL '1 minute')) WITH &&
  ) WHERE ("status" <> 'cancelled');
