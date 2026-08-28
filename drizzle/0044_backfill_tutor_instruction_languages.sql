-- Every tutor predates `tutors.instruction_languages`. Left null they would
-- have nothing to pick in the "Explained in" selector, so the scheduling forms
-- would refuse a class they are perfectly able to teach.
--
-- Their own `users.native_language` is the honest default: it is the language
-- the app already assumes they read and write, and it is what the tutor
-- onboarding wizard collected. A tutor who speaks more than one adds the rest
-- from their profile; this only guarantees the set is never empty.
UPDATE "tutors" AS t
SET "instruction_languages" = u."native_language"
FROM "users" AS u
WHERE u."id" = t."user_id"
  AND t."instruction_languages" IS NULL;
