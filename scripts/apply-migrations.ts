import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `);
  return r.rows.length > 0;
}

async function migration0016() {
  console.log('=== Migration 0016: Multi-language pivot ===\n');

  // 1. conversations: merge message_jp → message_target, message_en → message_native
  const hasMsgJp = await columnExists('conversations', 'message_jp');
  const hasMsgEn = await columnExists('conversations', 'message_en');
  if (hasMsgJp) {
    console.log('  Merging message_jp → message_target...');
    await db.execute(sql`UPDATE conversations SET message_target = message_jp WHERE message_target IS NULL`);
    await db.execute(sql`ALTER TABLE conversations ALTER COLUMN message_target SET NOT NULL`);
    await db.execute(sql`ALTER TABLE conversations DROP COLUMN message_jp`);
  } else {
    console.log('  message_jp already migrated, skipping.');
  }
  if (hasMsgEn) {
    console.log('  Merging message_en → message_native...');
    await db.execute(sql`UPDATE conversations SET message_native = message_en WHERE message_native IS NULL`);
    await db.execute(sql`ALTER TABLE conversations DROP COLUMN message_en`);
  } else {
    console.log('  message_en already migrated, skipping.');
  }

  // 2. vocabulary: rename japanese→target_text, english→translation, add language_code
  const hasVocabJp = await columnExists('vocabulary', 'japanese');
  if (hasVocabJp) {
    console.log('  Renaming vocabulary.japanese → target_text...');
    await db.execute(sql`ALTER TABLE vocabulary RENAME COLUMN japanese TO target_text`);
  }
  const hasVocabEn = await columnExists('vocabulary', 'english');
  if (hasVocabEn) {
    console.log('  Renaming vocabulary.english → translation...');
    await db.execute(sql`ALTER TABLE vocabulary RENAME COLUMN english TO translation`);
  }
  const hasVocabLang = await columnExists('vocabulary', 'language_code');
  if (!hasVocabLang) {
    console.log('  Adding vocabulary.language_code...');
    await db.execute(sql`ALTER TABLE vocabulary ADD COLUMN language_code varchar(10) NOT NULL DEFAULT 'ja'`);
  }

  // 3. scenario_goals: rename target_phrase_jp→target_phrase
  const hasPhraseJp = await columnExists('scenario_goals', 'target_phrase_jp');
  if (hasPhraseJp) {
    console.log('  Renaming scenario_goals.target_phrase_jp → target_phrase...');
    await db.execute(sql`ALTER TABLE scenario_goals RENAME COLUMN target_phrase_jp TO target_phrase`);
  }
  const hasGoalLang = await columnExists('scenario_goals', 'language_code');
  if (!hasGoalLang) {
    console.log('  Adding scenario_goals.language_code...');
    await db.execute(sql`ALTER TABLE scenario_goals ADD COLUMN language_code varchar(10) NOT NULL DEFAULT 'ja'`);
  }

  // 4. characters: add gender
  const hasCharGender = await columnExists('characters', 'gender');
  if (!hasCharGender) {
    console.log('  Adding characters.gender...');
    await db.execute(sql`ALTER TABLE characters ADD COLUMN gender varchar(10)`);
  }

  // 5. audio_jobs: add voice_gender
  const hasAudioVG = await columnExists('audio_jobs', 'voice_gender');
  if (!hasAudioVG) {
    console.log('  Adding audio_jobs.voice_gender...');
    await db.execute(sql`ALTER TABLE audio_jobs ADD COLUMN voice_gender varchar(10)`);
  }

  // 6. sessions: add avatar_enabled
  const hasAvatarEn = await columnExists('sessions', 'avatar_enabled');
  if (!hasAvatarEn) {
    console.log('  Adding sessions.avatar_enabled...');
    await db.execute(sql`ALTER TABLE sessions ADD COLUMN avatar_enabled boolean NOT NULL DEFAULT false`);
  }

  console.log('  ✓ Migration 0016 complete.\n');
}

async function migration0017() {
  console.log('=== Migration 0017: Voice gender & user_preferences ===\n');

  const hasVoiceGender = await columnExists('sessions', 'voice_gender');
  if (!hasVoiceGender) {
    console.log('  Adding sessions.voice_gender...');
    await db.execute(sql`ALTER TABLE sessions ADD COLUMN voice_gender varchar(10) NOT NULL DEFAULT 'female'`);
  } else {
    console.log('  sessions.voice_gender already exists, skipping.');
  }

  const hasPrefsTable = await db.execute(sql`
    SELECT table_name FROM information_schema.tables WHERE table_name = 'user_preferences'
  `);
  if (hasPrefsTable.rows.length === 0) {
    console.log('  Creating user_preferences table...');
    await db.execute(sql`
      CREATE TABLE user_preferences (
        user_id      text        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        voice_gender varchar(10) NOT NULL DEFAULT 'female',
        updated_at   timestamp   DEFAULT now()
      )
    `);
  } else {
    console.log('  user_preferences table already exists, skipping.');
  }

  console.log('  ✓ Migration 0017 complete.\n');
}

async function main() {
  await migration0016();
  await migration0017();
  console.log('=== All migrations applied ===');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
