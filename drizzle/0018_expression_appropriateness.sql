-- Add expressionAppropriatenessScore to sessions and evaluations tables
-- Add quick_drills table for P4

ALTER TABLE sessions ADD COLUMN expression_appropriateness_score integer;

ALTER TABLE evaluations ADD COLUMN expression_appropriateness_score integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quick_drills (
  id              serial PRIMARY KEY,
  domain_slug     varchar(40) NOT NULL,
  prompt_ja       text NOT NULL,
  prompt_phonetic text,
  prompt_en       text NOT NULL,
  expected_goal   varchar(200),
  difficulty      varchar(20) DEFAULT 'beginner',
  language_code   varchar(10) DEFAULT 'ja' NOT NULL,
  display_order   integer DEFAULT 0 NOT NULL,
  created_at      timestamp DEFAULT now()
);
