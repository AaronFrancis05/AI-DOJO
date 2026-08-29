import { pgTable, serial, varchar, text, timestamp, integer, boolean, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id:                    text('id').primaryKey(),
  name:                  varchar('name', { length: 100 }).notNull(),
  email:                 varchar('email', { length: 150 }).notNull().unique(),
  passwordHash:          varchar('password_hash', { length: 255 }),
  level:                 varchar('level', { length: 20 }).default('beginner').notNull(),
  // 'learner' | 'tutor' | 'admin'. A `tutors` row describes what a tutor
  // teaches; this column is what authorises them — see requireRole() in
  // lib/auth/server.ts. 'admin' satisfies every other role.
  role:                  varchar('role', { length: 20 }).default('learner').notNull(),
  // 'active' | 'suspended' | 'deleted'. Access is revoked here rather than by
  // deleting the row: users.id is referenced by sessions, evaluations, class
  // rosters and grades, so a hard delete rewrites other people's history.
  // Enforced in getAuthUser() — a suspended account gets no session, so the
  // check sits with authorisation rather than in the UI. 'deleted' is a soft
  // delete: the identity is anonymised, the foreign keys stay intact.
  status:                varchar('status', { length: 20 }).default('active').notNull(),
  suspendedAt:           timestamp('suspended_at'),
  suspendedReason:       text('suspended_reason'),
  deletedAt:             timestamp('deleted_at'),
  xp:                    integer('xp').default(0).notNull(),
  xpToNext:              integer('xp_to_next').default(1000).notNull(),
  tier:                  varchar('tier', { length: 20 }).default('premium').notNull(),
  nativeLanguage:        varchar('native_language', { length: 10 }).default('en').notNull(),
  preferredTargetLanguage: varchar('preferred_target_language', { length: 10 }).default('ja').notNull(),
  streak:                integer('streak').default(0).notNull(),
  lastActiveDate:        varchar('last_active_date', { length: 10 }),
  avatarSrc:             text('avatar_src'),
  consentToDataSharing:  boolean('consent_to_data_sharing').default(false).notNull(),
  authProvider:          varchar('auth_provider', { length: 20 }).default('credentials').notNull(),
  // The `neon_auth."user"` row this account signs in as, stamped by syncUser()
  // on sign-in. NULL means no auth identity has ever claimed this row — a
  // pre-provisioned invitation (see /api/admin/users/create) or a seeded
  // account — and that distinction is the whole point of the column:
  // reconcileDeletedAuthUsers() removes a row whose stamped identity has since
  // vanished from neon_auth, and must never sweep up a row that never had one.
  // Not a foreign key: neon_auth is Neon Auth's schema, not ours, and pinning
  // its table from a Drizzle migration would make their schema our problem.
  authUserId:            text('auth_user_id'),
  googleId:              varchar('google_id', { length: 255 }),
  learningGoal:          varchar('learning_goal', { length: 30 }),
  preferredDomainId:     integer('preferred_domain_id').references(() => domains.id),
  countryCode:           varchar('country_code', { length: 2 }).references(() => countries.code, { onDelete: 'set null' }),
  preferredMode:         varchar('preferred_mode', { length: 10 }),
  ageRange:              varchar('age_range', { length: 10 }),
  dailyGoalMinutes:      integer('daily_goal_minutes').default(30).notNull(),
  onboardingCompletedAt: timestamp('onboarding_completed_at'),
  createdAt:             timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  // One app account per auth identity. Nullable, and Postgres treats every
  // NULL as distinct, so any number of unclaimed invitations coexist.
  uqAuthUser: uniqueIndex('uq_users_auth_user_id').on(t.authUserId),
}));

// ── Languages ────────────────────────────────────────────
//
// The runtime language catalogue, seeded from lib/language.ts and thereafter
// owned by the admin console. A row carries everything TARGET_LANGUAGES'
// LanguageConfig does, because a language is not just a name: without the BCP47
// tags and the Azure voice ids nothing can be spoken or transcribed in it.
//
// lib/language.ts stays the compiled-in seed and fallback, so a cold deploy or
// an unreachable database still speaks the built-in set rather than nothing.
// Read through lib/language/registry.ts, never directly.
export const languages = pgTable('languages', {
  code:             varchar('code', { length: 10 }).primaryKey(),
  name:             varchar('name', { length: 60 }).notNull(),
  nativeName:       varchar('native_name', { length: 60 }).notNull(),
  flag:             varchar('flag', { length: 8 }).default('🌐').notNull(),
  sttBcp47:         varchar('stt_bcp47', { length: 20 }).notNull(),
  ttsBcp47:         varchar('tts_bcp47', { length: 20 }).notNull(),
  azureVoiceFemale: varchar('azure_voice_female', { length: 80 }).notNull(),
  azureVoiceMale:   varchar('azure_voice_male', { length: 80 }).notNull(),
  hasPhonetic:      boolean('has_phonetic').default(false).notNull(),
  ttsSupported:     boolean('tts_supported').default(true).notNull(),
  // 'bow' | 'wave' | null — null means wave, matching getGreetingGesture().
  greetingGesture:  varchar('greeting_gesture', { length: 10 }),
  // Which side of the pair this language may be picked for. A language can be
  // offered as something to learn, something to be taught in, or both.
  isTargetEnabled:  boolean('is_target_enabled').default(true).notNull(),
  isNativeEnabled:  boolean('is_native_enabled').default(true).notNull(),
  displayOrder:     integer('display_order').default(0).notNull(),
  // True for rows seeded from lib/language.ts. Those cannot be deleted — the
  // constant would reintroduce them on the next seed — only disabled.
  isBuiltIn:        boolean('is_built_in').default(false).notNull(),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at').defaultNow().notNull(),
});

// ── Domains ──────────────────────────────────────────────
export const domains = pgTable('domains', {
  id:               serial('id').primaryKey(),
  slug:             varchar('slug', { length: 40 }).notNull().unique(),
  name:             varchar('name', { length: 60 }).notNull(),
  description:      text('description').notNull(),
  icon:             varchar('icon', { length: 40 }).notNull(),
  heroGradientFrom: varchar('hero_gradient_from', { length: 20 }).notNull(),
  heroGradientTo:   varchar('hero_gradient_to', { length: 20 }).notNull(),
  imageUrl:         text('image_url'),
  situationCount:   integer('situation_count').default(0).notNull(),
  // Archiving, which is what the admin console's "remove" does. Deleting a
  // domain cascades to its situations, which sets scenarios.situation_id to
  // null and leaves them orphaned but alive — so a real delete quietly damages
  // the catalogue. Courses, levels and lessons already had this column;
  // domains and situations did not.
  isActive:         boolean('is_active').default(true).notNull(),
  displayOrder:     integer('display_order').default(0).notNull(),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
});

// ── Situations ───────────────────────────────────────────
export const situations = pgTable('situations', {
  id:            serial('id').primaryKey(),
  domainId:      integer('domain_id').references(() => domains.id, { onDelete: 'cascade' }).notNull(),
  title:         varchar('title', { length: 120 }).notNull(),
  context:       text('context').notNull(),
  skillLevel:    varchar('skill_level', { length: 20 }).default('beginner').notNull(),
  behaviorMode:  varchar('behavior_mode', { length: 20 }).default('standard').notNull(),
  learningGoals: text('learning_goals').notNull(),
  focusPills:    text('focus_pills').notNull(),
  isActive:      boolean('is_active').default(true).notNull(),   // see domains.isActive
  displayOrder:  integer('display_order').default(0).notNull(),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
});

// ── Characters ──────────────────────────────────────────
export const characters = pgTable('characters', {
  id:            serial('id').primaryKey(),
  name:          varchar('name', { length: 60 }).notNull(),
  role:          varchar('role', { length: 150 }).notNull(),
  personality:   text('personality').notNull(),
  avatarColor:   varchar('avatar_color', { length: 20 }).notNull(),
  avatarIcon:    varchar('avatar_icon', { length: 40 }).notNull(),
  voiceType:     varchar('voice_type', { length: 80 }).notNull(),
  gender:        varchar('gender', { length: 10 }),
  avatarModelUrl:text('avatar_model_url'),
  defaultForDomainId: integer('default_for_domain_id').references(() => domains.id, { onDelete: 'set null' }),
  displayOrder:  integer('display_order').default(0).notNull(),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
});

export const scenarios = pgTable('scenarios', {
  id:                 serial('id').primaryKey(),
  title:              varchar('title', { length: 120 }).notNull(),
  context:            text('context').notNull(),
  businessType:       varchar('business_type', { length: 80 }).notNull(),
  difficulty:         varchar('difficulty', { length: 20 }).default('beginner').notNull(),
  domain:             varchar('domain', { length: 40 }).default('daily_life').notNull(),
  aiCharacterName:    varchar('ai_character_name', { length: 80 }).notNull(),
  aiCharacterRole:    varchar('ai_character_role', { length: 150 }).notNull(),
  userCharacterName:  varchar('user_character_name', { length: 80 }).notNull(),
  userCharacterRole:  varchar('user_character_role', { length: 150 }).notNull(),
  learningGoals:      text('learning_goals').notNull(),
  situationId:        integer('situation_id').references(() => situations.id, { onDelete: 'set null' }),
  displayOrder:       integer('display_order').default(0).notNull(),
  createdAt:          timestamp('created_at').defaultNow().notNull(),
});

export const vocabulary = pgTable('vocabulary', {
  id:             serial('id').primaryKey(),
  scenarioId:     integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }).notNull(),
  targetText:     varchar('target_text', { length: 200 }).notNull(),
  phonetic:       varchar('phonetic', { length: 200 }),
  translation:    varchar('translation', { length: 300 }).notNull(),
  languageCode:   varchar('language_code', { length: 10 }).default('ja').notNull(),
  category:       varchar('category', { length: 60 }).notNull(),
  usageTip:       text('usage_tip'),
  formalityLevel: varchar('formality_level', { length: 20 }).default('polite').notNull(),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

export const vocabularyLocalizations = pgTable('vocabulary_localizations', {
  id:             serial('id').primaryKey(),
  vocabularyId:   integer('vocabulary_id').references(() => vocabulary.id, { onDelete: 'cascade' }).notNull(),
  languageCode:   varchar('language_code', { length: 10 }).notNull(),
  translation:    varchar('translation', { length: 300 }),
  usageTip:       text('usage_tip'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueVocabLang: uniqueIndex('uq_vocabulary_localizations_key').on(table.vocabularyId, table.languageCode),
}));

export const situationLocalizations = pgTable('situation_localizations', {
  id:            serial('id').primaryKey(),
  situationId:   integer('situation_id').references(() => situations.id, { onDelete: 'cascade' }).notNull(),
  languageCode:  varchar('language_code', { length: 10 }).notNull(),
  title:         varchar('title', { length: 120 }),
  context:       text('context'),
  learningGoals: text('learning_goals'),
  focusPills:    text('focus_pills'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueSituationLang: uniqueIndex('uq_situation_localizations_key').on(table.situationId, table.languageCode),
}));

export const scenarioLocalizations = pgTable('scenario_localizations', {
  id:                serial('id').primaryKey(),
  scenarioId:        integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }).notNull(),
  languageCode:      varchar('language_code', { length: 10 }).notNull(),
  title:             varchar('title', { length: 120 }),
  context:           text('context'),
  learningGoals:     text('learning_goals'),
  aiCharacterName:   varchar('ai_character_name', { length: 80 }),
  aiCharacterRole:   varchar('ai_character_role', { length: 150 }),
  userCharacterName: varchar('user_character_name', { length: 80 }),
  userCharacterRole: varchar('user_character_role', { length: 150 }),
  createdAt:         timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueScenarioLang: uniqueIndex('uq_scenario_localizations_key').on(table.scenarioId, table.languageCode),
}));

export const scenarioGoals = pgTable('scenario_goals', {
  id:             serial('id').primaryKey(),
  scenarioId:     integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }).notNull(),
  sequenceOrder:  integer('sequence_order').notNull(),
  goalText:       text('goal_text').notNull(),
  goalType:       varchar('goal_type', { length: 30 }).notNull(),
  targetPhrase:   varchar('target_phrase', { length: 200 }),
  languageCode:   varchar('language_code', { length: 10 }).default('ja').notNull(),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

export const scenarioGoalLocalizations = pgTable('scenario_goal_localizations', {
  id:             serial('id').primaryKey(),
  scenarioGoalId: integer('scenario_goal_id').references(() => scenarioGoals.id, { onDelete: 'cascade' }).notNull(),
  languageCode:   varchar('language_code', { length: 10 }).notNull(),
  goalText:       text('goal_text'),
  targetPhrase:   varchar('target_phrase', { length: 200 }),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueGoalLang: uniqueIndex('uq_scenario_goal_localizations_key').on(table.scenarioGoalId, table.languageCode),
}));

export const countries = pgTable('countries', {
  id:                    serial('id').primaryKey(),
  code:                  varchar('code', { length: 2 }).notNull().unique(),
  name:                  varchar('name', { length: 60 }).notNull(),
  nativeName:            varchar('native_name', { length: 60 }),
  flagEmoji:             varchar('flag_emoji', { length: 16 }),
  currency:              varchar('currency', { length: 12 }),
  locale:                varchar('locale', { length: 20 }),
  timezone:              varchar('timezone', { length: 40 }),
  defaultNativeLanguage: varchar('default_native_language', { length: 10 }).default('en').notNull(),
  displayOrder:          integer('display_order').default(0).notNull(),
  isActive:              boolean('is_active').default(true).notNull(),
  createdAt:             timestamp('created_at').defaultNow().notNull(),
});

export const scenarioSettings = pgTable('scenario_settings', {
  id:           serial('id').primaryKey(),
  scenarioId:   integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }).notNull(),
  countryCode:  varchar('country_code', { length: 2 }).references(() => countries.code, { onDelete: 'cascade' }).notNull(),
  isFeatured:   boolean('is_featured').default(false).notNull(),
  isAvailable:  boolean('is_available').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueScenarioCountry: uniqueIndex('uq_scenario_settings_key').on(table.scenarioId, table.countryCode),
}));

export const sessions = pgTable('sessions', {
  id:              serial('id').primaryKey(),
  userId:          text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  scenarioId:      integer('scenario_id').references(() => scenarios.id).notNull(),
  lessonId:        integer('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
  situationId:     integer('situation_id').references(() => situations.id, { onDelete: 'set null' }),
  characterId:     integer('character_id').references(() => characters.id, { onDelete: 'set null' }),
  behaviorMode:    varchar('behavior_mode', { length: 20 }).default('standard').notNull(),
  phase:           varchar('phase', { length: 20 }).default('orientation').notNull(),
  // Where inside `phase` the session is: 'open' (the character still has to
  // explain this stage), 'body' (running it), 'closing' (concluding it). A
  // phase only advances out of 'closing', so the turn that wraps a stage up
  // and the turn that opens the next one are never the same message.
  phaseStep:       varchar('phase_step', { length: 10 }).default('open').notNull(),
  icebreakerIndex: integer('icebreaker_index').default(0).notNull(),
  icebreakerVocabIndex:    integer('icebreaker_vocab_index').default(1).notNull(),
  icebreakerVocabAttempts: integer('icebreaker_vocab_attempts').default(0).notNull(),
  runningScore:    integer('running_score').default(100).notNull(),
  pendingRetryCorrectionId: integer('pending_retry_correction_id'),
  stalledTurnCount: integer('stalled_turn_count').default(0).notNull(),
  completionAcknowledged: boolean('completion_acknowledged').default(false).notNull(),
  targetLanguage:  varchar('target_language', { length: 10 }).default('ja').notNull(),
  nativeLanguage:  varchar('native_language', { length: 10 }).default('en').notNull(),
  sessionNumber:   integer('session_number').notNull(),
  status:          varchar('status', { length: 20 }).default('active').notNull(),
  totalTurns:      integer('total_turns').default(0).notNull(),
  phaseTurnCount:  integer('phase_turn_count').default(0).notNull(),
  vocabularyScore: integer('vocabulary_score'),
  grammarScore:    integer('grammar_score'),
  fluencyScore:    integer('fluency_score'),
  culturalScore:   integer('cultural_score'),
  taskScore:       integer('task_score'),
  feedback:        text('feedback'),
  avatarEnabled:   boolean('avatar_enabled').default(false).notNull(),
  voiceGender:     varchar('voice_gender', { length: 10 }).default('female').notNull(),
  selectedAvatarId: varchar('selected_avatar_id', { length: 40 }),
  expressionAppropriatenessScore: integer('expression_appropriateness_score'),
  startedAt:       timestamp('started_at').defaultNow().notNull(),
  lastActiveAt:    timestamp('last_active_at').defaultNow().notNull(),
  completedAt:     timestamp('completed_at'),
});

export const userPreferences = pgTable('user_preferences', {
  userId:      text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  voiceGender: varchar('voice_gender', { length: 10 }).default('female').notNull(),
  updatedAt:   timestamp('updated_at').defaultNow(),
});

export const conversations = pgTable('conversations', {
  id:                    serial('id').primaryKey(),
  sessionId:             integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),
  userId:                text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  turnNo:                integer('turn_no').notNull(),
  speaker:               varchar('speaker', { length: 20 }).notNull(),
  messageTarget:         text('message_target').notNull(),
  messageNative:         text('message_native'),
  messagePhonetic:       text('message_phonetic'),
  emotionTone:           varchar('emotion_tone', { length: 40 }),
  gestureHint:           varchar('gesture_hint', { length: 120 }),
  isEnglishWhenExpected: boolean('is_english_when_expected').default(false).notNull(),
  isValidInContext:      boolean('is_valid_in_context').default(true).notNull(),
  audioStatus:           varchar('audio_status', { length: 20 }).default('pending').notNull(),
  audioUrl:              text('audio_url'),
  responseTimeMs:        integer('response_time_ms'), // Added for P1
  createdAt:             timestamp('created_at').defaultNow().notNull(),
});

export const audioJobs = pgTable('audio_jobs', {
  id:             serial('id').primaryKey(),
  conversationId: integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  sessionId:      integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),
  text:           text('text').notNull(),
  lang:           varchar('lang', { length: 20 }).notNull(),
  phase:          varchar('phase', { length: 20 }).notNull(),
  speaker:        varchar('speaker', { length: 20 }).notNull(),
  voiceGender:    varchar('voice_gender', { length: 10 }),
  status:         varchar('status', { length: 20 }).default('pending').notNull(),
  attempts:       integer('attempts').default(0).notNull(),
  maxAttempts:    integer('max_attempts').default(3).notNull(),
  error:          text('error'),
  audioUrl:       text('audio_url'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  processedAt:    timestamp('processed_at'),
});

export const corrections = pgTable('corrections', {
  id:              serial('id').primaryKey(),
  conversationId:  integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  correctionType:  varchar('correction_type', { length: 30 }).notNull(),
  originalText:    text('original_text').notNull(),
  originalPhonetic: text('original_phonetic'),
  correctedText:   text('corrected_text').notNull(),
  correctedPhonetic: text('corrected_phonetic'),
  explanation:     text('explanation').notNull(),
  severity:        varchar('severity', { length: 20 }).default('minor').notNull(),
  retryOfCorrectionId: integer('retry_of_correction_id'),
  isFinalAttempt:      boolean('is_final_attempt').default(false).notNull(),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
});

export const evaluations = pgTable('evaluations', {
  id:              serial('id').primaryKey(),
  sessionId:       integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull().unique(),
  userId:          text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  vocabularyScore: integer('vocabulary_score').default(0).notNull(),
  grammarScore:    integer('grammar_score').default(0).notNull(),
  fluencyScore:    integer('fluency_score').default(0).notNull(),
  culturalScore:   integer('cultural_score').default(0).notNull(),
  taskScore:       integer('task_score').default(0).notNull(),
  expressionAppropriatenessScore: integer('expression_appropriateness_score').default(0).notNull(),
  feedback:        text('feedback'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
});

export const goalCompletions = pgTable('goal_completions', {
  id:              serial('id').primaryKey(),
  sessionId:       integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),
  conversationId:  integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  userId:          text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  scenarioGoalId:  integer('scenario_goal_id').references(() => scenarioGoals.id, { onDelete: 'cascade' }).notNull(),
  achieved:        boolean('achieved').default(true).notNull(),
  evidenceNote:    text('evidence_note'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
});

export const vocabularyEncounters = pgTable('vocabulary_encounters', {
  id:             serial('id').primaryKey(),
  sessionId:      integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),
  conversationId: integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  vocabularyId:   integer('vocabulary_id').references(() => vocabulary.id, { onDelete: 'set null' }),
  usedCorrectly:  boolean('used_correctly').notNull(),
  attemptNumber:  integer('attempt_number').default(1).notNull(),
  accuracyScore:  integer('accuracy_score'),
  phase:          varchar('phase', { length: 20 }).default('icebreaker').notNull(),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

export const shareTokens = pgTable('share_tokens', {
  id:        serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull().unique(),
  token:     varchar('token', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userAvatars = pgTable('user_avatars', {
  id:           serial('id').primaryKey(),
  userId:       text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  avatarUrl:    text('avatar_url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  isSelected:   boolean('is_selected').default(false).notNull(),
  source:       varchar('source', { length: 20 }).default('catalog').notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
});

export const quickDrills = pgTable('quick_drills', {
  id:               serial('id').primaryKey(),
  domainSlug:       varchar('domain_slug', { length: 40 }).notNull(),
  promptJa:         text('prompt_ja').notNull(),
  promptPhonetic:   text('prompt_phonetic'),
  promptEn:         text('prompt_en').notNull(),
  expectedGoal:     varchar('expected_goal', { length: 200 }),
  difficulty:       varchar('difficulty', { length: 20 }).default('beginner'),
  languageCode:     varchar('language_code', { length: 10 }).default('ja').notNull(),
  displayOrder:     integer('display_order').default(0).notNull(),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueDrillKey: uniqueIndex('uq_quick_drills_key').on(table.languageCode, table.domainSlug, table.promptJa),
}));

// ── Curriculum ────────────────────────────────────────────
// A course is a LANGUAGE-AGNOSTIC pedagogical template (title, structure).
// Target/ native language are chosen per-enrollment / per-session, never
// baked onto the course row — so the same template can be learned in any
// target language.
export const courses = pgTable('courses', {
  id:            serial('id').primaryKey(),
  slug:          varchar('slug', { length: 60 }).notNull().unique(),
  title:         varchar('title', { length: 120 }).notNull(),
  description:   text('description').notNull(),
  difficulty:    varchar('difficulty', { length: 20 }).default('beginner').notNull(),
  icon:          varchar('icon', { length: 40 }),
  isActive:      boolean('is_active').default(true).notNull(),
  displayOrder:  integer('display_order').default(0).notNull(),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
});

export const courseLevels = pgTable('course_levels', {
  id:            serial('id').primaryKey(),
  courseId:      integer('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  sequenceOrder: integer('sequence_order').notNull(),
  title:         varchar('title', { length: 120 }).notNull(),
  description:   text('description'),
  requiredXp:    integer('required_xp').default(0).notNull(),
  isActive:      boolean('is_active').default(true).notNull(),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueLevelOrder: uniqueIndex('uq_course_levels_key').on(table.courseId, table.sequenceOrder),
}));

export const units = pgTable('units', {
  id:            serial('id').primaryKey(),
  levelId:       integer('level_id').references(() => courseLevels.id, { onDelete: 'cascade' }).notNull(),
  sequenceOrder: integer('sequence_order').notNull(),
  title:         varchar('title', { length: 120 }).notNull(),
  description:   text('description'),
  displayOrder:  integer('display_order').default(0).notNull(),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueUnitOrder: uniqueIndex('uq_units_key').on(table.levelId, table.sequenceOrder),
}));

export const lessons = pgTable('lessons', {
  id:                serial('id').primaryKey(),
  unitId:            integer('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
  sequenceOrder:     integer('sequence_order').notNull(),
  title:             varchar('title', { length: 120 }).notNull(),
  summary:           text('summary'),
  scenarioId:        integer('scenario_id').references(() => scenarios.id, { onDelete: 'set null' }),
  estimatedMinutes:  integer('estimated_minutes').default(10).notNull(),
  isActive:          boolean('is_active').default(true).notNull(),
  displayOrder:      integer('display_order').default(0).notNull(),
  createdAt:         timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueLessonOrder: uniqueIndex('uq_lessons_key').on(table.unitId, table.sequenceOrder),
}));

export const lessonPhases = pgTable('lesson_phases', {
  id:               serial('id').primaryKey(),
  lessonId:         integer('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  sequenceOrder:    integer('sequence_order').notNull(),
  phaseKey:         varchar('phase_key', { length: 20 }).notNull(),
  title:            varchar('title', { length: 120 }).notNull(),
  objective:        text('objective'),
  durationMinutes:  integer('duration_minutes').default(3).notNull(),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniquePhaseOrder: uniqueIndex('uq_lesson_phases_key').on(table.lessonId, table.sequenceOrder),
}));

export const studentProgress = pgTable('student_progress', {
  id:               serial('id').primaryKey(),
  userId:           text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  courseId:         integer('course_id').references(() => courses.id, { onDelete: 'cascade' }).notNull(),
  targetLanguage:   varchar('target_language', { length: 10 }).default('ja').notNull(),
  nativeLanguage:   varchar('native_language', { length: 10 }).default('en').notNull(),
  currentLevelId:   integer('current_level_id').references(() => courseLevels.id, { onDelete: 'set null' }),
  currentUnitId:    integer('current_unit_id').references(() => units.id, { onDelete: 'set null' }),
  currentLessonId:  integer('current_lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
  currentPhaseKey:  varchar('current_phase_key', { length: 20 }),
  lessonsCompleted: integer('lessons_completed').default(0).notNull(),
  xpEarned:         integer('xp_earned').default(0).notNull(),
  status:           varchar('status', { length: 20 }).default('not_started').notNull(),
  // JSON array of unit ids the learner has explicitly marked finished, in the
  // same text-column-holding-JSON shape as studentLessonProgress.completedPhases.
  // Distinct from "every lesson in the unit is complete": that is derived, this
  // is the learner's own acknowledgement, and only the acknowledgement opens
  // the unit's live-lesson footer.
  acknowledgedUnitIds: text('acknowledged_unit_ids'),
  lastActivityAt:   timestamp('last_activity_at'),
  updatedAt:        timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueUserCourseLang: uniqueIndex('uq_student_progress_key').on(table.userId, table.courseId, table.targetLanguage),
}));

export const studentLessonProgress = pgTable('student_lesson_progress', {
  id:              serial('id').primaryKey(),
  userId:          text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lessonId:        integer('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }).notNull(),
  targetLanguage:  varchar('target_language', { length: 10 }).default('ja').notNull(),
  status:          varchar('status', { length: 20 }).default('not_started').notNull(),
  currentPhaseKey: varchar('current_phase_key', { length: 20 }),
  completedPhases: text('completed_phases'),
  score:           integer('score'),
  bestScore:       integer('best_score'),
  attempts:        integer('attempts').default(0).notNull(),
  lastActivityAt:  timestamp('last_activity_at'),
  completedAt:     timestamp('completed_at'),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueUserLessonLang: uniqueIndex('uq_student_lesson_progress_key').on(table.userId, table.lessonId, table.targetLanguage),
}));

export const srsCards = pgTable('srs_cards', {
  id:            serial('id').primaryKey(),
  userId:        text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  vocabularyId:  integer('vocabulary_id').references(() => vocabulary.id, { onDelete: 'cascade' }).notNull(),
  state:         varchar('state', { length: 20 }).default('learning').notNull(),
  intervalDays:  integer('interval_days').default(0).notNull(),
  easeFactor:    numeric('ease_factor', { precision: 5, scale: 2 }).default('2.5').notNull(),
  reviewCount:   integer('review_count').default(0).notNull(),
  lapseCount:    integer('lapse_count').default(0).notNull(),
  lastReviewedAt: timestamp('last_reviewed_at'),
  nextReviewAt:  timestamp('next_review_at').defaultNow().notNull(),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  uniqueUserVocab: uniqueIndex('uq_srs_cards_key').on(table.userId, table.vocabularyId),
}));

// ── Relations ────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  country:          one(countries, { fields: [users.countryCode], references: [countries.code] }),
  sessions:         many(sessions),
  conversations:    many(conversations),
  evaluations:      many(evaluations),
  goalCompletions:  many(goalCompletions),
  avatars:          many(userAvatars),
  courseProgress:   many(studentProgress),
  lessonProgress:   many(studentLessonProgress),
  srsCards:         many(srsCards),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  levels:     many(courseLevels),
  progress:   many(studentProgress),
}));

export const courseLevelsRelations = relations(courseLevels, ({ one, many }) => ({
  course:  one(courses, { fields: [courseLevels.courseId], references: [courses.id] }),
  units:   many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  level:   one(courseLevels, { fields: [units.levelId], references: [courseLevels.id] }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  unit:         one(units, { fields: [lessons.unitId], references: [units.id] }),
  scenario:     one(scenarios, { fields: [lessons.scenarioId], references: [scenarios.id] }),
  phases:       many(lessonPhases),
  progress:     many(studentLessonProgress),
}));

export const lessonPhasesRelations = relations(lessonPhases, ({ one }) => ({
  lesson: one(lessons, { fields: [lessonPhases.lessonId], references: [lessons.id] }),
}));

export const studentProgressRelations = relations(studentProgress, ({ one }) => ({
  user:   one(users, { fields: [studentProgress.userId], references: [users.id] }),
  course: one(courses, { fields: [studentProgress.courseId], references: [courses.id] }),
}));

export const studentLessonProgressRelations = relations(studentLessonProgress, ({ one }) => ({
  user:   one(users, { fields: [studentLessonProgress.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [studentLessonProgress.lessonId], references: [lessons.id] }),
}));

export const srsCardsRelations = relations(srsCards, ({ one }) => ({
  user:       one(users, { fields: [srsCards.userId], references: [users.id] }),
  vocabulary: one(vocabulary, { fields: [srsCards.vocabularyId], references: [vocabulary.id] }),
}));

export const countriesRelations = relations(countries, ({ many }) => ({
  scenarioSettings: many(scenarioSettings),
}));

export const scenarioSettingsRelations = relations(scenarioSettings, ({ one }) => ({
  scenario: one(scenarios, { fields: [scenarioSettings.scenarioId], references: [scenarios.id] }),
  country:  one(countries, { fields: [scenarioSettings.countryCode], references: [countries.code] }),
}));

export const userAvatarsRelations = relations(userAvatars, ({ one }) => ({
  user: one(users, { fields: [userAvatars.userId], references: [users.id] }),
}));

export const domainsRelations = relations(domains, ({ many }) => ({
  situations: many(situations),
}));

export const situationsRelations = relations(situations, ({ one, many }) => ({
  domain:     one(domains, { fields: [situations.domainId], references: [domains.id] }),
  scenarios:  many(scenarios),
  sessions:   many(sessions),
  localizations: many(situationLocalizations),
}));

export const situationLocalizationsRelations = relations(situationLocalizations, ({ one }) => ({
  situation: one(situations, { fields: [situationLocalizations.situationId], references: [situations.id] }),
}));

export const charactersRelations = relations(characters, ({ one }) => ({
  defaultForDomain: one(domains, { fields: [characters.defaultForDomainId], references: [domains.id] }),
}));

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  situation:     one(situations, { fields: [scenarios.situationId], references: [situations.id] }),
  sessions:      many(sessions),
  vocabularies:  many(vocabulary),
  goals:         many(scenarioGoals),
  localizations: many(scenarioLocalizations),
  countrySettings: many(scenarioSettings),
}));

export const vocabularyRelations = relations(vocabulary, ({ one, many }) => ({
  scenario:  one(scenarios, { fields: [vocabulary.scenarioId], references: [scenarios.id] }),
  encounters: many(vocabularyEncounters),
  localizations: many(vocabularyLocalizations),
}));

export const scenarioLocalizationsRelations = relations(scenarioLocalizations, ({ one }) => ({
  scenario: one(scenarios, { fields: [scenarioLocalizations.scenarioId], references: [scenarios.id] }),
}));

export const vocabularyLocalizationsRelations = relations(vocabularyLocalizations, ({ one }) => ({
  vocabulary: one(vocabulary, { fields: [vocabularyLocalizations.vocabularyId], references: [vocabulary.id] }),
}));

export const scenarioGoalsRelations = relations(scenarioGoals, ({ one, many }) => ({
  scenario:    one(scenarios, { fields: [scenarioGoals.scenarioId], references: [scenarios.id] }),
  completions: many(goalCompletions),
  localizations: many(scenarioGoalLocalizations),
}));

export const scenarioGoalLocalizationsRelations = relations(scenarioGoalLocalizations, ({ one }) => ({
  scenarioGoal: one(scenarioGoals, { fields: [scenarioGoalLocalizations.scenarioGoalId], references: [scenarioGoals.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user:                one(users,     { fields: [sessions.userId],     references: [users.id] }),
  scenario:            one(scenarios, { fields: [sessions.scenarioId], references: [scenarios.id] }),
  situation:           one(situations, { fields: [sessions.situationId], references: [situations.id] }),
  character:           one(characters, { fields: [sessions.characterId], references: [characters.id] }),
  conversations:       many(conversations),
  evaluation:          one(evaluations),
  goalCompletions:     many(goalCompletions),
  vocabularyEncounters:many(vocabularyEncounters),
  shareToken:          one(shareTokens),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  session:     one(sessions, { fields: [conversations.sessionId], references: [sessions.id] }),
  user:        one(users,    { fields: [conversations.userId],   references: [users.id] }),
  corrections: many(corrections),
  audioJobs:   many(audioJobs),
}));

export const audioJobsRelations = relations(audioJobs, ({ one }) => ({
  conversation: one(conversations, { fields: [audioJobs.conversationId], references: [conversations.id] }),
  session:      one(sessions,      { fields: [audioJobs.sessionId],      references: [sessions.id] }),
}));

export const correctionsRelations = relations(corrections, ({ one }) => ({
  conversation: one(conversations, { fields: [corrections.conversationId], references: [conversations.id] }),
}));

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  session: one(sessions, { fields: [evaluations.sessionId], references: [sessions.id] }),
  user:    one(users,    { fields: [evaluations.userId],     references: [users.id] }),
}));

export const goalCompletionsRelations = relations(goalCompletions, ({ one }) => ({
  session:      one(sessions,      { fields: [goalCompletions.sessionId],      references: [sessions.id] }),
  conversation: one(conversations, { fields: [goalCompletions.conversationId], references: [conversations.id] }),
  user:         one(users,         { fields: [goalCompletions.userId],         references: [users.id] }),
  scenarioGoal: one(scenarioGoals, { fields: [goalCompletions.scenarioGoalId], references: [scenarioGoals.id] }),
}));

export const shareTokensRelations = relations(shareTokens, ({ one }) => ({
  session: one(sessions, { fields: [shareTokens.sessionId], references: [sessions.id] }),
}));

export const vocabularyEncountersRelations = relations(vocabularyEncounters, ({ one }) => ({
  session:      one(sessions,      { fields: [vocabularyEncounters.sessionId],      references: [sessions.id] }),
  conversation: one(conversations, { fields: [vocabularyEncounters.conversationId], references: [conversations.id] }),
  vocabulary:   one(vocabulary,    { fields: [vocabularyEncounters.vocabularyId],   references: [vocabulary.id] }),
}));

// ── Messaging (human-to-human chat rooms with UgaJapa translation) ──────

export const chatRooms = pgTable('chat_rooms', {
  id:        serial('id').primaryKey(),
  name:      varchar('name', { length: 150 }),                       // optional display name (group chats)
  isGroup:   boolean('is_group').default(false).notNull(),
  // 'direct'  — a 1:1 or ad-hoc group room, de-duplicated by membership.
  // 'class'   — the room a scheduled class_session creates for itself.
  // 'cohort'  — a tutor's standing room for their learners, which outlives any
  //             one class. Found by (ownerTutorId, audienceKey) so re-running
  //             the create adds newly-enrolled learners instead of a second
  //             room — see `audienceKey` below for why the name is not enough.
  kind:      varchar('kind', { length: 20 }).default('direct').notNull(),
  ownerTutorId: integer('owner_tutor_id').references(() => tutors.id, { onDelete: 'set null' }),
  // Cohort rooms only. The audience this room was opened for, canonicalised as
  // `<kind>|<scope…>|<name>` by `cohortAudienceKey()` in
  // `app/api/tutor/cohorts/route.ts`. Identity has to include the scope: every
  // unnamed cohort defaults to the same name, so keying re-use on the name
  // alone made a course room and an all-learners room the *same* room, with one
  // audience reading the other's history.
  audienceKey: varchar('audience_key', { length: 200 }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  idxOwnerKind: index('idx_chat_rooms_owner_kind').on(t.ownerTutorId, t.kind),
  // Partial: only cohort rooms carry an audience key, and only they may not be
  // duplicated. Differently-named or differently-scoped cohorts get different
  // keys and so still coexist; a concurrent double-create collapses onto one
  // row instead of racing past the SELECT above it.
  uqCohortAudience: uniqueIndex('uq_chat_rooms_cohort_audience')
    .on(t.ownerTutorId, t.audienceKey)
    .where(sql`${t.kind} = 'cohort'`),
}));

export const chatRoomMembers = pgTable('chat_room_members', {
  id:                 serial('id').primaryKey(),
  roomId:              integer('room_id').references(() => chatRooms.id, { onDelete: 'cascade' }).notNull(),
  userId:              text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  preferredLanguage:   varchar('preferred_language', { length: 10 }), // overrides users.nativeLanguage as this member's translation target in this room
  lastReadAt:          timestamp('last_read_at'),
  joinedAt:            timestamp('joined_at').defaultNow().notNull(),
}, (t) => ({
  uqMember: uniqueIndex('uq_chat_room_member').on(t.roomId, t.userId),
}));

export const chatMessages = pgTable('chat_messages', {
  id:                serial('id').primaryKey(),
  roomId:            integer('room_id').references(() => chatRooms.id, { onDelete: 'cascade' }).notNull(),
  senderId:          text('sender_id').references(() => users.id, { onDelete: 'set null' }),
  body:              text('body').notNull(),                          // original text, as typed (or transcribed) by the sender
  sourceLanguage:    varchar('source_language', { length: 10 }),       // detected/declared language of `body`
  audioUrl:          text('audio_url'),                                // data: URL of the recorded voice clip (voice messages)
  audioMimeType:     varchar('audio_mime_type', { length: 40 }),       // e.g. audio/webm;codecs=opus
  audioDurationMs:   integer('audio_duration_ms'),                     // recorded clip length, for the player UI
  createdAt:         timestamp('created_at').defaultNow().notNull(),
});

// Cached per-target-language translations of a message, so a room with
// several members reading in different languages only pays for each
// (message, targetLanguage) translation once.
export const chatMessageTranslations = pgTable('chat_message_translations', {
  id:              serial('id').primaryKey(),
  messageId:       integer('message_id').references(() => chatMessages.id, { onDelete: 'cascade' }).notNull(),
  targetLanguage:  varchar('target_language', { length: 10 }).notNull(),
  translatedText:  text('translated_text').notNull(),
  qualityScore:    numeric('quality_score', { precision: 4, scale: 2 }),  // UgaJapa quality-scoring metadata, when available
  provider:        varchar('provider', { length: 30 }).default('ugajapa').notNull(),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uqTranslation: uniqueIndex('uq_chat_message_translation').on(t.messageId, t.targetLanguage),
}));

export const chatRoomsRelations = relations(chatRooms, ({ many }) => ({
  members:   many(chatRoomMembers),
  messages:  many(chatMessages),
}));

export const chatRoomMembersRelations = relations(chatRoomMembers, ({ one }) => ({
  room: one(chatRooms, { fields: [chatRoomMembers.roomId], references: [chatRooms.id] }),
  user: one(users,     { fields: [chatRoomMembers.userId], references: [users.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  room:         one(chatRooms,       { fields: [chatMessages.roomId],     references: [chatRooms.id] }),
  sender:       one(users,           { fields: [chatMessages.senderId],   references: [users.id] }),
  translations: many(chatMessageTranslations),
}));

export const chatMessageTranslationsRelations = relations(chatMessageTranslations, ({ one }) => ({
  message: one(chatMessages, { fields: [chatMessageTranslations.messageId], references: [chatMessages.id] }),
}));

// ── Live tutoring (human tutors over GetStream Video) ──────────────────
//
// Learners book a real tutor for a lesson, or for a human read on whether
// the AI actually taught them what it claims. Sessions run in a GetStream
// call; tutor↔learner text uses the existing chatRooms tables rather than a
// second messaging system — deliberately, since GetStream Chat is a separate
// and far more expensive contract than GetStream Video.
//
// The UI is gated behind NEXT_PUBLIC_TUTORS_ENABLED until Stream credentials
// are configured — see lib/tutors/config.ts.

export const tutors = pgTable('tutors', {
  id:             serial('id').primaryKey(),
  userId:         text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  headline:       varchar('headline', { length: 160 }).notNull(),
  bio:            text('bio'),
  // Comma-separated language codes this tutor teaches, matching the codes in
  // lib/language.ts (e.g. "ja,fr"). Kept denormalized for the same reason
  // scenarios keep their vocabulary inline: it is read on every listing and
  // never queried independently.
  languages:      text('languages').notNull(),
  // The native languages this tutor can *explain* in, same comma-separated
  // shape as `languages` above. The two are different capabilities: `languages`
  // is what they teach (the target), this is what they teach it in. A tutor who
  // speaks five languages can pair any of them, and a class picks one of each —
  // see class_sessions.instructionLanguage.
  instructionLanguages: text('instruction_languages'),
  hourlyRateCents: integer('hourly_rate_cents').default(0).notNull(),
  currency:        varchar('currency', { length: 3 }).default('USD').notNull(),
  timezone:        varchar('timezone', { length: 60 }).default('UTC').notNull(),
  // 'pending' until a human verifies them; only 'verified' tutors are listed.
  verificationStatus: varchar('verification_status', { length: 20 }).default('pending').notNull(),
  isAcceptingBookings: boolean('is_accepting_bookings').default(true).notNull(),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

export const tutorAvailability = pgTable('tutor_availability', {
  id:         serial('id').primaryKey(),
  tutorId:    integer('tutor_id').references(() => tutors.id, { onDelete: 'cascade' }).notNull(),
  // 0 = Sunday … 6 = Saturday, in the tutor's own timezone.
  dayOfWeek:  integer('day_of_week').notNull(),
  // Minutes from midnight, so a slot is timezone-arithmetic-free to store.
  startMinute: integer('start_minute').notNull(),
  endMinute:   integer('end_minute').notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uqSlot: uniqueIndex('uq_tutor_availability_slot').on(t.tutorId, t.dayOfWeek, t.startMinute),
}));

export const tutorBookings = pgTable('tutor_bookings', {
  id:          serial('id').primaryKey(),
  tutorId:     integer('tutor_id').references(() => tutors.id, { onDelete: 'cascade' }).notNull(),
  learnerId:   text('learner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // Set when the booking is a human review of one specific AI session.
  sessionId:   integer('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  targetLanguage: varchar('target_language', { length: 10 }).notNull(),
  instructionLanguage: varchar('instruction_language', { length: 10 }),
  scheduledAt: timestamp('scheduled_at').notNull(),
  durationMinutes: integer('duration_minutes').default(30).notNull(),
  // 'requested' | 'confirmed' | 'cancelled' | 'completed'
  status:      varchar('status', { length: 20 }).default('requested').notNull(),
  // 'lesson' — ordinary practice; 'evaluation' — verify what the AI taught.
  purpose:     varchar('purpose', { length: 20 }).default('lesson').notNull(),
  learnerNote: text('learner_note'),
  // The GetStream call this booking meets in. Generated at booking time so
  // both sides resolve the same call without a negotiation step, and never
  // returned except alongside a token — see lib/tutors/rooms.ts.
  callId:      varchar('call_id', { length: 80 }).notNull().unique(),
  // Stream call type, which is what carries the permission grants. Stored
  // rather than assumed so a deployment can move rooms onto a custom type
  // without a migration on every existing row.
  callType:    varchar('call_type', { length: 30 }).default('default').notNull(),
  // Reuses the existing messaging tables for tutor↔learner chat.
  chatRoomId:  integer('chat_room_id').references(() => chatRooms.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  // Every read of this table is "this tutor's bookings, in time order" (the
  // overlap check on booking, the availability expansion) or "my bookings".
  idxTutorSchedule: index('idx_tutor_bookings_tutor_scheduled').on(t.tutorId, t.scheduledAt),
  idxLearner:       index('idx_tutor_bookings_learner').on(t.learnerId),
}));

/* ── Group classrooms ──────────────────────────────────────────────────
 *
 * A scheduled lesson one tutor teaches to many learners, optionally pinned
 * to a curriculum unit so the course page can offer "join the live lesson
 * for this unit". Distinct from `tutor_bookings`, which is 1:1 and initiated
 * by the learner: a class is created by the tutor and enrolled into.
 */

export const classSessions = pgTable('class_sessions', {
  id:             serial('id').primaryKey(),
  tutorId:        integer('tutor_id').references(() => tutors.id, { onDelete: 'cascade' }).notNull(),
  // Both nullable: a class may be a standalone conversation hour rather than
  // the live counterpart of one unit.
  courseId:       integer('course_id').references(() => courses.id, { onDelete: 'set null' }),
  unitId:         integer('unit_id').references(() => units.id, { onDelete: 'set null' }),
  title:          varchar('title', { length: 150 }).notNull(),
  description:    text('description'),
  targetLanguage: varchar('target_language', { length: 10 }).notNull(),
  // The language the tutor explains in, chosen from their own
  // `tutors.instructionLanguages`. Null means what the app did before this
  // column existed: each learner reads in their own users.nativeLanguage.
  instructionLanguage: varchar('instruction_language', { length: 10 }),
  scheduledAt:    timestamp('scheduled_at').notNull(),
  durationMinutes: integer('duration_minutes').default(60).notNull(),
  capacity:       integer('capacity').default(12).notNull(),
  callId:         varchar('call_id', { length: 80 }).notNull().unique(),
  callType:       varchar('call_type', { length: 30 }).default('default').notNull(),
  // 'scheduled' | 'live' | 'completed' | 'cancelled'
  status:         varchar('status', { length: 20 }).default('scheduled').notNull(),
  // When the room actually opened, as distinct from when it was scheduled to.
  // Also the idempotency guard for the go-live fan-out: a tutor toggling
  // live → scheduled → live must not announce themselves to the cohort twice.
  // Null on a room that has never been opened, including a cancelled one.
  wentLiveAt:     timestamp('went_live_at'),
  // The classroom's text chat reuses the messaging tables — and therefore the
  // per-member UgaJapa translation, which is the whole point in a room where
  // the learners do not share a native language.
  chatRoomId:     integer('chat_room_id').references(() => chatRooms.id, { onDelete: 'set null' }),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  idxTutorSchedule: index('idx_class_sessions_tutor_scheduled').on(t.tutorId, t.scheduledAt),
  // "Is there a live lesson for this unit?" is the course page's query.
  idxUnitSchedule:  index('idx_class_sessions_unit_scheduled').on(t.unitId, t.scheduledAt),
}));

export const classEnrollments = pgTable('class_enrollments', {
  id:             serial('id').primaryKey(),
  classSessionId: integer('class_session_id').references(() => classSessions.id, { onDelete: 'cascade' }).notNull(),
  learnerId:      text('learner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // 'enrolled' | 'attended' | 'cancelled'
  status:         varchar('status', { length: 20 }).default('enrolled').notNull(),
  enrolledAt:     timestamp('enrolled_at').defaultNow().notNull(),
  attendedAt:     timestamp('attended_at'),
}, (t) => ({
  uqEnrollment: uniqueIndex('uq_class_enrollment').on(t.classSessionId, t.learnerId),
  idxLearner:   index('idx_class_enrollments_learner').on(t.learnerId),
}));

/* ── Assessment rooms ──────────────────────────────────────────────────
 *
 * The same call plumbing as a class, run as an examination: exactly one
 * learner is in the room at a time and the rest wait in a queue the tutor
 * admits from. The queue is OURS — a table, pushed over lib/realtime — not
 * Stream's, because who is next is an academic decision, not a media one.
 */

export const assessmentSessions = pgTable('assessment_sessions', {
  id:             serial('id').primaryKey(),
  tutorId:        integer('tutor_id').references(() => tutors.id, { onDelete: 'cascade' }).notNull(),
  courseId:       integer('course_id').references(() => courses.id, { onDelete: 'set null' }),
  unitId:         integer('unit_id').references(() => units.id, { onDelete: 'set null' }),
  title:          varchar('title', { length: 150 }).notNull(),
  description:    text('description'),
  targetLanguage: varchar('target_language', { length: 10 }).notNull(),
  // As on class_sessions — and it also reaches the AI examiner, whose locked
  // brief tells it to examine in the target language but explain in this one.
  instructionLanguage: varchar('instruction_language', { length: 10 }),
  scheduledAt:    timestamp('scheduled_at').notNull(),
  durationMinutes: integer('duration_minutes').default(60).notNull(),
  // Shown to a waiting learner as "about N minutes until your turn", derived
  // from their queue position. An estimate, never a scheduler.
  minutesPerLearner: integer('minutes_per_learner').default(10).notNull(),
  callId:         varchar('call_id', { length: 80 }).notNull().unique(),
  callType:       varchar('call_type', { length: 30 }).default('default').notNull(),
  // 'tutor' — the tutor examines each learner over the Stream call.
  // 'ai'    — a Gemini Live examiner does, one private session per learner,
  //           for when the tutor cannot be there. Switchable after creation:
  //           "I can't make it" is exactly when this is decided.
  examiner:       varchar('examiner', { length: 10 }).default('tutor').notNull(),
  // Which face the AI examiner wears — an id from lib/avatar/catalog.ts, so
  // the interviewer reuses the existing character art (a still image, not the
  // 3D avatar) rather than introducing a second catalogue.
  aiInterviewerAvatarId: varchar('ai_interviewer_avatar_id', { length: 40 }),
  // The tutor's own brief for the examiner: what to probe, what to ignore.
  // Folded into the system instruction that gets LOCKED into the learner's
  // ephemeral token, so the browser cannot rewrite it.
  aiInterviewerBrief:    text('ai_interviewer_brief'),
  // 'scheduled' | 'live' | 'completed' | 'cancelled'
  status:         varchar('status', { length: 20 }).default('scheduled').notNull(),
  // As on class_sessions: when the room actually opened, and the guard that
  // keeps the go-live announcement from firing twice.
  wentLiveAt:     timestamp('went_live_at'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  idxTutorSchedule: index('idx_assessment_sessions_tutor_scheduled').on(t.tutorId, t.scheduledAt),
}));

export const assessmentQueue = pgTable('assessment_queue', {
  id:            serial('id').primaryKey(),
  assessmentId:  integer('assessment_id').references(() => assessmentSessions.id, { onDelete: 'cascade' }).notNull(),
  learnerId:     text('learner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // 1-based, dense within an assessment. Rewritten on admit/withdraw rather
  // than left sparse, so "you are 3rd" needs no counting query on read.
  position:      integer('position').notNull(),
  // 'waiting' | 'admitted' | 'done'
  state:         varchar('state', { length: 20 }).default('waiting').notNull(),
  joinedAt:      timestamp('joined_at').defaultNow().notNull(),
  admittedAt:    timestamp('admitted_at'),
  completedAt:   timestamp('completed_at'),
}, (t) => ({
  uqLearner:  uniqueIndex('uq_assessment_queue_learner').on(t.assessmentId, t.learnerId),
  idxOrder:   index('idx_assessment_queue_order').on(t.assessmentId, t.position),
}));

/**
 * One learner's spoken interview with the AI examiner.
 *
 * Anchored to the queue slot, not to `(assessmentId, learnerId)`: the slot
 * already carries that pair under `uq_assessment_queue_learner`, so a unique
 * `queue_slot_id` gives "one interview per learner per assessment" without a
 * second constraint saying the same thing. The two ids beside it are
 * denormalised for filtering, the same way `tutor_evaluations` carries both
 * its anchor and the pair it implies.
 *
 * Scores land HERE, not in `tutor_evaluations`. That table exists to answer
 * "did the AI's assessment hold up against a human's" — writing a machine
 * verdict into it under the scheduling tutor's id would make `agreesWithAi`
 * meaningless. Kept separate, the reverse becomes possible instead: a tutor
 * who was absent can come back, read the transcript, and file a real
 * `tutor_evaluations` row against the same queue slot — which is the first
 * time that comparison has a concrete AI verdict to be measured against.
 *
 * `transcript` is JSON in a text column, matching
 * `student_lesson_progress.completed_phases` rather than introducing jsonb.
 * It is CLIENT-REPORTED: the Live socket runs browser↔Google, so the server
 * never witnesses the audio. See lib/interview/transcript.ts.
 */
export const aiInterviews = pgTable('ai_interviews', {
  id:            serial('id').primaryKey(),
  queueSlotId:   integer('queue_slot_id').references(() => assessmentQueue.id, { onDelete: 'cascade' }).notNull().unique(),
  assessmentId:  integer('assessment_id').references(() => assessmentSessions.id, { onDelete: 'cascade' }).notNull(),
  learnerId:     text('learner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  targetLanguage: varchar('target_language', { length: 10 }).notNull(),
  /** The Live model the token was locked to — recorded so a score can be read in the light of what produced it. */
  model:         varchar('model', { length: 80 }).notNull(),
  /** 'pending' | 'live' | 'completed' | 'failed' */
  status:        varchar('status', { length: 20 }).default('pending').notNull(),
  startedAt:     timestamp('started_at'),
  endedAt:       timestamp('ended_at'),
  /** Learner turns only — the examiner's own lines are not evidence of anything. */
  learnerTurns:  integer('learner_turns').default(0).notNull(),
  transcript:    text('transcript'),
  // The same six 0-100 dimensions everything else in this app grades on.
  vocabularyScore: integer('vocabulary_score'),
  grammarScore:    integer('grammar_score'),
  fluencyScore:    integer('fluency_score'),
  culturalScore:   integer('cultural_score'),
  taskScore:       integer('task_score'),
  expressionAppropriatenessScore: integer('expression_appropriateness_score'),
  feedback:      text('feedback'),
  gradedAt:      timestamp('graded_at'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
  updatedAt:     timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  idxAssessment: index('idx_ai_interviews_assessment').on(t.assessmentId, t.status),
  idxLearner:    index('idx_ai_interviews_learner').on(t.learnerId),
}));

/**
 * A tutor's verdict on a learner, on the SAME 0-100 dimensions the AI grades
 * (see SCORE_DIMENSIONS in lib/ai-engine.ts) so the two can be shown
 * side by side. `agreesWithAi` is the point of the whole feature: did the AI's
 * assessment hold up against a human's?
 *
 * A verdict is anchored to exactly one of two things — a 1:1 booking, or one
 * learner's slot in an assessment room — so both `bookingId` and
 * `assessmentQueueId` are nullable and each is unique. (Postgres unique
 * indexes admit many NULLs, so "one evaluation per booking" and "one per
 * queue slot" both still hold.) The alternative, a synthetic booking row per
 * examined learner, would put rows in `tutor_bookings` that nobody booked.
 */
export const tutorEvaluations = pgTable('tutor_evaluations', {
  id:          serial('id').primaryKey(),
  bookingId:   integer('booking_id').references(() => tutorBookings.id, { onDelete: 'cascade' }).unique(),
  assessmentQueueId: integer('assessment_queue_id').references(() => assessmentQueue.id, { onDelete: 'cascade' }).unique(),
  tutorId:     integer('tutor_id').references(() => tutors.id, { onDelete: 'cascade' }).notNull(),
  learnerId:   text('learner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // Null when the booking wasn't tied to a specific AI session.
  sessionId:   integer('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  vocabularyScore: integer('vocabulary_score'),
  grammarScore:    integer('grammar_score'),
  fluencyScore:    integer('fluency_score'),
  culturalScore:   integer('cultural_score'),
  taskScore:       integer('task_score'),
  expressionAppropriatenessScore: integer('expression_appropriateness_score'),
  // 'agrees' | 'too_generous' | 'too_harsh' — how the AI's score compared.
  agreesWithAi: varchar('agrees_with_ai', { length: 20 }),
  notes:       text('notes'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});

export const tutorsRelations = relations(tutors, ({ one, many }) => ({
  user:         one(users, { fields: [tutors.userId], references: [users.id] }),
  availability: many(tutorAvailability),
  bookings:     many(tutorBookings),
}));

export const tutorAvailabilityRelations = relations(tutorAvailability, ({ one }) => ({
  tutor: one(tutors, { fields: [tutorAvailability.tutorId], references: [tutors.id] }),
}));

export const tutorBookingsRelations = relations(tutorBookings, ({ one }) => ({
  tutor:    one(tutors,    { fields: [tutorBookings.tutorId],    references: [tutors.id] }),
  learner:  one(users,     { fields: [tutorBookings.learnerId],  references: [users.id] }),
  session:  one(sessions,  { fields: [tutorBookings.sessionId],  references: [sessions.id] }),
  chatRoom: one(chatRooms, { fields: [tutorBookings.chatRoomId], references: [chatRooms.id] }),
}));

export const tutorEvaluationsRelations = relations(tutorEvaluations, ({ one }) => ({
  booking: one(tutorBookings, { fields: [tutorEvaluations.bookingId], references: [tutorBookings.id] }),
  queueSlot: one(assessmentQueue, { fields: [tutorEvaluations.assessmentQueueId], references: [assessmentQueue.id] }),
  tutor:   one(tutors,        { fields: [tutorEvaluations.tutorId],   references: [tutors.id] }),
  learner: one(users,         { fields: [tutorEvaluations.learnerId], references: [users.id] }),
  session: one(sessions,      { fields: [tutorEvaluations.sessionId], references: [sessions.id] }),
}));

export const classSessionsRelations = relations(classSessions, ({ one, many }) => ({
  tutor:       one(tutors,    { fields: [classSessions.tutorId],    references: [tutors.id] }),
  course:      one(courses,   { fields: [classSessions.courseId],   references: [courses.id] }),
  unit:        one(units,     { fields: [classSessions.unitId],     references: [units.id] }),
  chatRoom:    one(chatRooms, { fields: [classSessions.chatRoomId], references: [chatRooms.id] }),
  enrollments: many(classEnrollments),
}));

export const classEnrollmentsRelations = relations(classEnrollments, ({ one }) => ({
  classSession: one(classSessions, { fields: [classEnrollments.classSessionId], references: [classSessions.id] }),
  learner:      one(users,         { fields: [classEnrollments.learnerId],      references: [users.id] }),
}));

export const assessmentSessionsRelations = relations(assessmentSessions, ({ one, many }) => ({
  tutor:  one(tutors,  { fields: [assessmentSessions.tutorId],  references: [tutors.id] }),
  course: one(courses, { fields: [assessmentSessions.courseId], references: [courses.id] }),
  unit:   one(units,   { fields: [assessmentSessions.unitId],   references: [units.id] }),
  queue:  many(assessmentQueue),
}));

export const assessmentQueueRelations = relations(assessmentQueue, ({ one }) => ({
  assessment: one(assessmentSessions, { fields: [assessmentQueue.assessmentId], references: [assessmentSessions.id] }),
  learner:    one(users,              { fields: [assessmentQueue.learnerId],    references: [users.id] }),
}));

export const aiInterviewsRelations = relations(aiInterviews, ({ one }) => ({
  queueSlot:  one(assessmentQueue,    { fields: [aiInterviews.queueSlotId],  references: [assessmentQueue.id] }),
  assessment: one(assessmentSessions, { fields: [aiInterviews.assessmentId], references: [assessmentSessions.id] }),
  learner:    one(users,              { fields: [aiInterviews.learnerId],    references: [users.id] }),
}));

// ── Notifications ──────────────────────────────────────────────────────
//
// One row per thing a user should be told about, pushed to an open tab over
// lib/realtime and read back through /api/notifications. Deliberately dumb:
// a title, a body and a link. Anything richer belongs on the page the `href`
// points at, not duplicated into a bell.

export const notifications = pgTable('notifications', {
  id:        serial('id').primaryKey(),
  userId:    text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // 'evaluation' | 'class' | 'assessment' | 'booking' | 'announcement' — what
  // produced it. 'announcement' is the only one a human authors; the rest fall
  // out of an action that already succeeded.
  type:      varchar('type', { length: 40 }).notNull(),
  title:     varchar('title', { length: 160 }).notNull(),
  body:      text('body'),
  href:      text('href'),
  readAt:    timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  // Every read is "my notifications, newest first".
  idxUserCreated: index('idx_notifications_user_created').on(t.userId, t.createdAt),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// The tutor's authored record of an announcement. The delivery is still one
// `notifications` row per recipient — that is what the live bell already reads,
// and a per-recipient row is what makes "read" meaningful. This table exists so
// the tutor can see what they sent and to whom, which a fan-out alone loses.
export const tutorAnnouncements = pgTable('tutor_announcements', {
  id:                  serial('id').primaryKey(),
  tutorId:             integer('tutor_id').references(() => tutors.id, { onDelete: 'cascade' }).notNull(),
  title:               varchar('title', { length: 160 }).notNull(),
  body:                text('body').notNull(),
  // The course the announcement is about, and the language it is written in.
  targetLanguage:      varchar('target_language', { length: 10 }),
  instructionLanguage: varchar('instruction_language', { length: 10 }),
  // 'class' | 'course' | 'all_my_learners' — resolved by resolveAudience() in
  // lib/tutors/audience.ts, which is the only place the membership rules live.
  audienceKind:        varchar('audience_kind', { length: 20 }).notNull(),
  classSessionId:      integer('class_session_id').references(() => classSessions.id, { onDelete: 'set null' }),
  courseId:            integer('course_id').references(() => courses.id, { onDelete: 'set null' }),
  // Counted at send time. The audience changes as learners enrol and leave, so
  // recomputing it later would not describe what was actually delivered.
  recipientCount:      integer('recipient_count').default(0).notNull(),
  createdAt:           timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  idxTutorCreated: index('idx_tutor_announcements_tutor_created').on(t.tutorId, t.createdAt),
}));

// ── Calendar ─────────────────────────────────────────────────────────
//
// The one genuinely new piece of scheduled data: a user's own to-dos, plus
// the "do this lesson" reminders seeded onto a learner's calendar right
// after onboarding (see lib/calendar/seed-lesson-plan.ts). Everything else
// that shows up on /calendar — sessions, tutor bookings, classes,
// assessments — already has its own row with a date; /api/calendar reads
// those live rather than copying them in here.

export const calendarTasks = pgTable('calendar_tasks', {
  id:            serial('id').primaryKey(),
  userId:        text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title:         varchar('title', { length: 160 }).notNull(),
  notes:         text('notes'),
  dueAt:         timestamp('due_at').notNull(),
  allDay:        boolean('all_day').default(true).notNull(),
  // 'task' — user-authored to-do. 'lesson_reminder' — system-seeded from the
  // post-onboarding plan, points back at sourceLessonId.
  kind:          varchar('kind', { length: 20 }).default('task').notNull(),
  sourceLessonId: integer('source_lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
  status:        varchar('status', { length: 20 }).default('pending').notNull(), // 'pending' | 'done'
  completedAt:   timestamp('completed_at'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  // Every read is "my to-dos due around this date".
  idxUserDue: index('idx_calendar_tasks_user_due').on(t.userId, t.dueAt),
  // sourceLessonId is NULL for free-form tasks — a unique index over a
  // nullable column treats every NULL as distinct, so many free-form tasks
  // coexist fine while still capping the seeded plan at one reminder per
  // (user, lesson), the same trick tutorEvaluations uses for its two
  // nullable anchor columns.
  uqUserLesson: uniqueIndex('uq_calendar_tasks_user_lesson').on(t.userId, t.sourceLessonId),
}));

export const calendarTasksRelations = relations(calendarTasks, ({ one }) => ({
  user:         one(users,   { fields: [calendarTasks.userId],         references: [users.id] }),
  sourceLesson: one(lessons, { fields: [calendarTasks.sourceLessonId], references: [lessons.id] }),
}));