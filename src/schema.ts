import { pgTable, serial, varchar, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. USERS TABLE
export const users = pgTable('users', {
  id:                    serial('id').primaryKey(),
  name:                  varchar('name', { length: 100 }).notNull(),
  email:                 varchar('email', { length: 150 }).notNull().unique(),
  passwordHash:          varchar('password_hash', { length: 255 }),
  level:                 varchar('level', { length: 20 }).default('beginner').notNull(),
  authProvider:          varchar('auth_provider', { length: 20 }).default('credentials').notNull(),
  googleId:              varchar('google_id', { length: 255 }),
  consentToDataSharing:  boolean('consent_to_data_sharing').default(false).notNull(),
  resetTokenHash:        varchar('reset_token_hash', { length: 255 }),
  resetTokenExpiresAt:   timestamp('reset_token_expires_at'),
  createdAt:             timestamp('created_at').defaultNow().notNull(),
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
  displayOrder:       integer('display_order').default(0).notNull(),
  createdAt:          timestamp('created_at').defaultNow().notNull(),
});

export const vocabulary = pgTable('vocabulary', {
  id:             serial('id').primaryKey(),
  scenarioId:     integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }).notNull(),
  japanese:       varchar('japanese', { length: 200 }).notNull(),
  romaji:         varchar('romaji', { length: 200 }).notNull(),
  english:        varchar('english', { length: 300 }).notNull(),
  category:       varchar('category', { length: 60 }).notNull(),
  usageTip:       text('usage_tip'),
  formalityLevel: varchar('formality_level', { length: 20 }).default('polite').notNull(),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

export const scenarioGoals = pgTable('scenario_goals', {
  id:             serial('id').primaryKey(),
  scenarioId:     integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }).notNull(),
  sequenceOrder:  integer('sequence_order').notNull(),
  goalText:       text('goal_text').notNull(),
  goalType:       varchar('goal_type', { length: 30 }).notNull(),
  targetPhraseJp: varchar('target_phrase_jp', { length: 200 }),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id:              serial('id').primaryKey(),
  userId:          integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  scenarioId:      integer('scenario_id').references(() => scenarios.id).notNull(),
  sessionNumber:   integer('session_number').notNull(),
  status:          varchar('status', { length: 20 }).default('active').notNull(),
  totalTurns:      integer('total_turns').default(0).notNull(),
  vocabularyScore: integer('vocabulary_score'),
  grammarScore:    integer('grammar_score'),
  fluencyScore:    integer('fluency_score'),
  culturalScore:   integer('cultural_score'),
  taskScore:       integer('task_score'),
  feedback:        text('feedback'),
  startedAt:       timestamp('started_at').defaultNow().notNull(),
  completedAt:     timestamp('completed_at'),
});

export const conversations = pgTable('conversations', {
  id:                    serial('id').primaryKey(),
  sessionId:             integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),
  turnNo:                integer('turn_no').notNull(),
  speaker:               varchar('speaker', { length: 20 }).notNull(),
  messageJp:             text('message_jp').notNull(),
  messageRomaji:         text('message_romaji'),
  messageEn:             text('message_en').notNull(),
  emotionTone:           varchar('emotion_tone', { length: 40 }),
  gestureHint:           varchar('gesture_hint', { length: 120 }),
  isEnglishWhenExpected: boolean('is_english_when_expected').default(false).notNull(),
  isValidInContext:      boolean('is_valid_in_context').default(true).notNull(),
  createdAt:             timestamp('created_at').defaultNow().notNull(),
});

export const corrections = pgTable('corrections', {
  id:              serial('id').primaryKey(),
  conversationId:  integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  correctionType:  varchar('correction_type', { length: 30 }).notNull(),
  originalText:    text('original_text').notNull(),
  correctedText:   text('corrected_text').notNull(),
  explanation:     text('explanation').notNull(),
  severity:        varchar('severity', { length: 20 }).default('minor').notNull(),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
});

export const evaluations = pgTable('evaluations', {
  id:              serial('id').primaryKey(),
  sessionId:       integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull().unique(),
  vocabularyScore: integer('vocabulary_score').default(0).notNull(),
  grammarScore:    integer('grammar_score').default(0).notNull(),
  fluencyScore:    integer('fluency_score').default(0).notNull(),
  culturalScore:   integer('cultural_score').default(0).notNull(),
  taskScore:       integer('task_score').default(0).notNull(),
  feedback:        text('feedback'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
});

export const goalCompletions = pgTable('goal_completions', {
  id:              serial('id').primaryKey(),
  sessionId:       integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull(),
  conversationId:  integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
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
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

export const shareTokens = pgTable('share_tokens', {
  id:        serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull().unique(),
  token:     varchar('token', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. SCENARIOS TABLE
export const scenarios = pgTable('scenarios', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 100 }).notNull(),
  context: text('context').notNull(),
  businessType: varchar('business_type', { length: 80 }).notNull(),
  difficulty: varchar('difficulty', { length: 20 }).default('beginner').notNull(),
  aiCharacterName: varchar('ai_character_name', { length: 80 }).notNull(),
  aiCharacterRole: varchar('ai_character_role', { length: 120 }).notNull(),
  userCharacterName: varchar('user_character_name', { length: 80 }).notNull(),
  userCharacterRole: varchar('user_character_role', { length: 120 }).notNull(),
  learningGoals: text('learning_goals').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. VOCABULARY TABLE
export const vocabulary = pgTable('vocabulary', {
  id: serial('id').primaryKey(),
  scenarioId: integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
  japanese: varchar('japanese', { length: 200 }).notNull(),
  romaji: varchar('romaji', { length: 200 }).notNull(),
  english: varchar('english', { length: 300 }).notNull(),
  category: varchar('category', { length: 60 }).notNull(),
  usageTip: text('usage_tip'),
  formalityLevel: varchar('formality_level', { length: 20 }).default('formal').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. CONVERSATIONS TABLE
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  scenarioId: integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  turnNo: integer('turn_no').notNull(),
  speaker: varchar('speaker', { length: 20 }).notNull(), // ai, user
  messageJp: text('message_jp').notNull(),
  messageRomaji: text('message_romaji'),
  messageEn: text('message_en').notNull(),
  notes: text('notes'),
  teachingNote: text('teaching_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. EVALUATIONS TABLE
export const evaluations = pgTable('evaluations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  scenarioId: integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
  vocabularyScore: integer('vocabulary_score').default(0).notNull(),
  grammarScore: integer('grammar_score').default(0).notNull(),
  fluencyScore: integer('fluency_score').default(0).notNull(),
  culturalScore: integer('cultural_score').default(0).notNull(),
  taskScore: integer('task_score').default(0).notNull(),
  feedback: text('feedback'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// RELATIONSHIPS
export const usersRelations = relations(users, ({ many }) => ({
  conversations: many(conversations),
  evaluations: many(evaluations),
}));

export const scenariosRelations = relations(scenarios, ({ many }) => ({
  vocabularies: many(vocabulary),
  conversations: many(conversations),
  evaluations: many(evaluations),
  goals: many(scenarioGoals),
}));

export const vocabularyRelations = relations(vocabulary, ({ one }) => ({
  scenario: one(scenarios, { fields: [vocabulary.scenarioId], references: [scenarios.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  scenario: one(scenarios, { fields: [conversations.scenarioId], references: [scenarios.id] }),
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
}));

// 6. SCENARIO GOALS TABLE
export const scenarioGoals = pgTable('scenario_goals', {
  id: serial('id').primaryKey(),
  scenarioId: integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
  sequenceOrder: integer('sequence_order').notNull(),
  goalText: text('goal_text').notNull(),
  goalType: varchar('goal_type', { length: 30 }).notNull(),
  targetPhraseJp: varchar('target_phrase_jp', { length: 200 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 7. GOAL COMPLETIONS TABLE
export const goalCompletions = pgTable('goal_completions', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  scenarioGoalId: integer('scenario_goal_id').references(() => scenarioGoals.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  achieved: boolean('achieved').default(true).notNull(),
  evidenceNote: text('evidence_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  user: one(users, { fields: [evaluations.userId], references: [users.id] }),
  scenario: one(scenarios, { fields: [evaluations.scenarioId], references: [scenarios.id] }),
}));

export const scenarioGoalsRelations = relations(scenarioGoals, ({ one, many }) => ({
  scenario: one(scenarios, { fields: [scenarioGoals.scenarioId], references: [scenarios.id] }),
  completions: many(goalCompletions),
}));

export const goalCompletionsRelations = relations(goalCompletions, ({ one }) => ({
  conversation: one(conversations, { fields: [goalCompletions.conversationId], references: [conversations.id] }),
  scenarioGoal: one(scenarioGoals, { fields: [goalCompletions.scenarioGoalId], references: [scenarioGoals.id] }),
  user: one(users, { fields: [goalCompletions.userId], references: [users.id] }),
}));