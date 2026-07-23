-- Add voice_gender per-session and a user_preferences table for the global default

ALTER TABLE sessions ADD COLUMN voice_gender varchar(10) NOT NULL DEFAULT 'female';

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id      text        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  voice_gender varchar(10) NOT NULL DEFAULT 'female',
  updated_at   timestamp   DEFAULT now()
);
