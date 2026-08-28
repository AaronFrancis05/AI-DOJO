-- Cohort rooms created before `audience_key` existed were found by
-- (owner_tutor_id, kind, name). Without a key they would never be matched by
-- the new lookup, so the next press of "group room" would open a second room
-- and leave the existing message history behind.
--
-- The only caller ever shipped sends `class` (whose room takes the class title
-- as its name) or `all_my_learners` (which always uses the default name), so
-- the audience is recoverable: a room named after one of that tutor's own
-- classes is that class's room, and everything else is the all-learners room.

UPDATE chat_rooms r
SET audience_key = 'class|' || c.id || '|' || r.name
FROM class_sessions c
WHERE r.kind = 'cohort'
  AND r.audience_key IS NULL
  AND r.name IS NOT NULL
  AND c.tutor_id = r.owner_tutor_id
  AND c.title = r.name;
--> statement-breakpoint
UPDATE chat_rooms
SET audience_key = 'all_my_learners|' || coalesce(name, 'My learners')
WHERE kind = 'cohort'
  AND audience_key IS NULL;
