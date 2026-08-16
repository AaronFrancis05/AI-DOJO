ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "persona_overrides" text;
