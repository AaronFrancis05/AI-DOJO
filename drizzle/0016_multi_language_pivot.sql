-- Multi-language pivot: rename Japanese-specific columns to generic, add language/gender/avatar columns

-- 1. conversations: merge message_jp into message_target, message_en into message_native
UPDATE conversations SET message_target = message_jp WHERE message_target IS NULL;
UPDATE conversations SET message_native = message_en WHERE message_native IS NULL;
ALTER TABLE conversations ALTER COLUMN message_target SET NOT NULL;
ALTER TABLE conversations DROP COLUMN message_jp;
ALTER TABLE conversations DROP COLUMN message_en;

-- 2. vocabulary: rename Japanese-specific columns, add language_code
ALTER TABLE vocabulary RENAME COLUMN japanese TO target_text;
ALTER TABLE vocabulary RENAME COLUMN english TO translation;
ALTER TABLE vocabulary ADD COLUMN language_code varchar(10) NOT NULL DEFAULT 'ja';

-- 3. scenario_goals: rename target_phrase_jp, add language_code
ALTER TABLE scenario_goals RENAME COLUMN target_phrase_jp TO target_phrase;
ALTER TABLE scenario_goals ADD COLUMN language_code varchar(10) NOT NULL DEFAULT 'ja';

-- 4. characters: add gender column
ALTER TABLE characters ADD COLUMN gender varchar(10);

-- 5. audio_jobs: add voice_gender column
ALTER TABLE audio_jobs ADD COLUMN voice_gender varchar(10);

-- 6. sessions: add avatar_enabled column
ALTER TABLE sessions ADD COLUMN avatar_enabled boolean NOT NULL DEFAULT false;
