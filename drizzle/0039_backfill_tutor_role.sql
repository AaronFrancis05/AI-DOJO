-- Every user who already has a `tutors` row predates users.role and would
-- otherwise be locked out of the tutor surfaces the moment requireRole()
-- starts gating them. Admins are not backfilled — there is no structural
-- signal for one, so the first admin is promoted by hand.
UPDATE "users"
SET "role" = 'tutor'
WHERE "role" = 'learner'
  AND "id" IN (SELECT "user_id" FROM "tutors");
