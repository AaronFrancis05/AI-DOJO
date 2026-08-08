import { pgTable, serial, varchar, text, timestamp, integer, boolean, numeric, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id:                    text('id').primaryKey(),
  name:                  varchar('name', { length: 100 }).notNull(),
  email:                 varchar('email', { length: 150 }).notNull().unique(),
  passwordHash:          varchar('password_hash', { length: 255 }),
  level:                 varchar('level', { length: 20 }).default('beginner').notNull(),
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
  googleId:              varchar('google_id', { length: 255 }),
  learningGoal:          varchar('learning_goal', { length: 30 }),
  preferredDomainId:     integer('preferred_domain_id').references(() => domains.id),
  countryCode:           varchar('country_code', { length: 2 }).references(() => countries.code, { onDelete: 'set null' }),
  preferredMode:         varchar('preferred_mode', { length: 10 }),
  ageRange:              varchar('age_range', { length: 10 }),
  dailyGoalMinutes:      integer('daily_goal_minutes').default(30).notNull(),
  onboardingCompletedAt: timestamp('onboarding_completed_at'),
  createdAt:             timestamp('created_at').defaultNow().notNull(),
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
  phase:           varchar('phase', { length: 20 }).default('icebreaker').notNull(),
  icebreakerIndex: integer('icebreaker_index').default(0).notNull(),
  runningScore:    integer('running_score').default(100).notNull(),
  pendingRetryCorrectionId: integer('pending_retry_correction_id'),
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
  expressionAppropriatenessScore: integer('expression_appropriateness_score'),
  startedAt:       timestamp('started_at').defaultNow().notNull(),
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
  source:       varchar('source', { length: 20 }).default('avaturn').notNull(),
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
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
  id:             serial('id').primaryKey(),
  roomId:         integer('room_id').references(() => chatRooms.id, { onDelete: 'cascade' }).notNull(),
  senderId:       text('sender_id').references(() => users.id, { onDelete: 'set null' }),
  body:           text('body').notNull(),                             // original text, as typed by the sender
  sourceLanguage: varchar('source_language', { length: 10 }),          // detected/declared language of `body`
  createdAt:      timestamp('created_at').defaultNow().notNull(),
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

export const chatRoomMembersRelations = relations(chatRoomMembers, ({ one, many }) => ({
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