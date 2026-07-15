import { pgTable, serial, varchar, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
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
  consentToDataSharing:  boolean('consent_to_data_sharing').default(false).notNull(),
  authProvider:          varchar('auth_provider', { length: 20 }).default('credentials').notNull(),
  googleId:              varchar('google_id', { length: 255 }),
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
  userId:          text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  scenarioId:      integer('scenario_id').references(() => scenarios.id).notNull(),
  situationId:     integer('situation_id').references(() => situations.id, { onDelete: 'set null' }),
  characterId:     integer('character_id').references(() => characters.id, { onDelete: 'set null' }),
  behaviorMode:    varchar('behavior_mode', { length: 20 }).default('standard').notNull(),
  targetLanguage:  varchar('target_language', { length: 10 }).default('ja').notNull(),
  nativeLanguage:  varchar('native_language', { length: 10 }).default('en').notNull(),
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
  userId:                text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  turnNo:                integer('turn_no').notNull(),
  speaker:               varchar('speaker', { length: 20 }).notNull(),
  messageTarget:         text('message_target'),
  messageNative:         text('message_native'),
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
  userId:          text('user_id').references(() => users.id, { onDelete: 'cascade' }),
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
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

export const shareTokens = pgTable('share_tokens', {
  id:        serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => sessions.id, { onDelete: 'cascade' }).notNull().unique(),
  token:     varchar('token', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Relations ────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions:         many(sessions),
  conversations:    many(conversations),
  evaluations:      many(evaluations),
  goalCompletions:  many(goalCompletions),
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
}));

export const vocabularyRelations = relations(vocabulary, ({ one, many }) => ({
  scenario:  one(scenarios, { fields: [vocabulary.scenarioId], references: [scenarios.id] }),
  encounters: many(vocabularyEncounters),
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
