import { pgTable, foreignKey, text, varchar, timestamp, serial, integer, unique, boolean, uniqueIndex, real } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const userPreferences = pgTable("user_preferences", {
	userId: text("user_id").primaryKey().notNull(),
	voiceGender: varchar("voice_gender", { length: 10 }).default('female').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	uiLanguage: varchar("ui_language", { length: 10 }).default('en').notNull(),
	responseLanguage: varchar("response_language", { length: 10 }).default('ja').notNull(),
	lastAvatar: varchar("last_avatar", { length: 80 }),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_preferences_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const audioJobs = pgTable("audio_jobs", {
	id: serial().primaryKey().notNull(),
	conversationId: integer("conversation_id").notNull(),
	sessionId: integer("session_id").notNull(),
	text: text().notNull(),
	lang: varchar({ length: 20 }).notNull(),
	phase: varchar({ length: 20 }).notNull(),
	speaker: varchar({ length: 20 }).notNull(),
	voiceGender: varchar("voice_gender", { length: 10 }),
	status: varchar({ length: 20 }).default('pending').notNull(),
	attempts: integer().default(0).notNull(),
	maxAttempts: integer("max_attempts").default(3).notNull(),
	error: text(),
	audioUrl: text("audio_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "audio_jobs_conversation_id_conversations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [sessions.id],
			name: "audio_jobs_session_id_sessions_id_fk"
		}).onDelete("cascade"),
]);

export const domains = pgTable("domains", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 40 }).notNull(),
	name: varchar({ length: 60 }).notNull(),
	description: text().notNull(),
	icon: varchar({ length: 40 }).notNull(),
	heroGradientFrom: varchar("hero_gradient_from", { length: 20 }).notNull(),
	heroGradientTo: varchar("hero_gradient_to", { length: 20 }).notNull(),
	imageUrl: text("image_url"),
	situationCount: integer("situation_count").default(0).notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("domains_slug_unique").on(table.slug),
]);

export const evaluations = pgTable("evaluations", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	userId: text("user_id"),
	vocabularyScore: integer("vocabulary_score").default(0).notNull(),
	grammarScore: integer("grammar_score").default(0).notNull(),
	fluencyScore: integer("fluency_score").default(0).notNull(),
	culturalScore: integer("cultural_score").default(0).notNull(),
	taskScore: integer("task_score").default(0).notNull(),
	expressionAppropriatenessScore: integer("expression_appropriateness_score").default(0).notNull(),
	feedback: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [sessions.id],
			name: "evaluations_session_id_sessions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "evaluations_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("evaluations_session_id_unique").on(table.sessionId),
]);

export const corrections = pgTable("corrections", {
	id: serial().primaryKey().notNull(),
	conversationId: integer("conversation_id").notNull(),
	correctionType: varchar("correction_type", { length: 30 }).notNull(),
	originalText: text("original_text").notNull(),
	originalRomaji: text("original_romaji"),
	correctedText: text("corrected_text").notNull(),
	correctedRomaji: text("corrected_romaji"),
	explanation: text().notNull(),
	severity: varchar({ length: 20 }).default('minor').notNull(),
	retryOfCorrectionId: integer("retry_of_correction_id"),
	isFinalAttempt: boolean("is_final_attempt").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "corrections_conversation_id_conversations_id_fk"
		}).onDelete("cascade"),
]);

export const goalCompletions = pgTable("goal_completions", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	conversationId: integer("conversation_id"),
	userId: text("user_id"),
	scenarioGoalId: integer("scenario_goal_id").notNull(),
	achieved: boolean().default(true).notNull(),
	evidenceNote: text("evidence_note"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [sessions.id],
			name: "goal_completions_session_id_sessions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "goal_completions_conversation_id_conversations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "goal_completions_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.scenarioGoalId],
			foreignColumns: [scenarioGoals.id],
			name: "goal_completions_scenario_goal_id_scenario_goals_id_fk"
		}).onDelete("cascade"),
]);

export const conversations = pgTable("conversations", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	userId: text("user_id"),
	turnNo: integer("turn_no").notNull(),
	speaker: varchar({ length: 20 }).notNull(),
	messageTarget: text("message_target").notNull(),
	messageNative: text("message_native"),
	messageRomaji: text("message_romaji"),
	emotionTone: varchar("emotion_tone", { length: 40 }),
	gestureHint: varchar("gesture_hint", { length: 120 }),
	isEnglishWhenExpected: boolean("is_english_when_expected").default(false).notNull(),
	isValidInContext: boolean("is_valid_in_context").default(true).notNull(),
	audioStatus: varchar("audio_status", { length: 20 }).default('pending').notNull(),
	audioUrl: text("audio_url"),
	responseTimeMs: integer("response_time_ms"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	characterName: varchar("character_name", { length: 80 }),
}, (table) => [
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [sessions.id],
			name: "conversations_session_id_sessions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "conversations_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const quickDrills = pgTable("quick_drills", {
	id: serial().primaryKey().notNull(),
	domainSlug: varchar("domain_slug", { length: 40 }).notNull(),
	promptJa: text("prompt_ja").notNull(),
	promptPhonetic: text("prompt_phonetic"),
	promptEn: text("prompt_en").notNull(),
	expectedGoal: varchar("expected_goal", { length: 200 }),
	difficulty: varchar({ length: 20 }).default('beginner'),
	languageCode: varchar("language_code", { length: 10 }).default('ja').notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("uq_quick_drills_key").using("btree", table.languageCode.asc().nullsLast().op("text_ops"), table.domainSlug.asc().nullsLast().op("text_ops"), table.promptJa.asc().nullsLast().op("text_ops")),
]);

export const situations = pgTable("situations", {
	id: serial().primaryKey().notNull(),
	domainId: integer("domain_id").notNull(),
	title: varchar({ length: 120 }).notNull(),
	context: text().notNull(),
	skillLevel: varchar("skill_level", { length: 20 }).default('beginner').notNull(),
	behaviorMode: varchar("behavior_mode", { length: 20 }).default('standard').notNull(),
	learningGoals: text("learning_goals").notNull(),
	focusPills: text("focus_pills").notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.domainId],
			foreignColumns: [domains.id],
			name: "situations_domain_id_domains_id_fk"
		}).onDelete("cascade"),
]);

export const scenarioGoals = pgTable("scenario_goals", {
	id: serial().primaryKey().notNull(),
	scenarioId: integer("scenario_id").notNull(),
	sequenceOrder: integer("sequence_order").notNull(),
	goalText: text("goal_text").notNull(),
	goalType: varchar("goal_type", { length: 30 }).notNull(),
	targetPhrase: varchar("target_phrase", { length: 200 }),
	languageCode: varchar("language_code", { length: 10 }).default('ja').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "scenario_goals_scenario_id_scenarios_id_fk"
		}).onDelete("cascade"),
]);

export const shareTokens = pgTable("share_tokens", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	token: varchar({ length: 64 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [sessions.id],
			name: "share_tokens_session_id_sessions_id_fk"
		}).onDelete("cascade"),
	unique("share_tokens_session_id_unique").on(table.sessionId),
	unique("share_tokens_token_unique").on(table.token),
]);

export const vocabulary = pgTable("vocabulary", {
	id: serial().primaryKey().notNull(),
	scenarioId: integer("scenario_id").notNull(),
	targetText: varchar("target_text", { length: 200 }).notNull(),
	romaji: varchar({ length: 200 }),
	translation: varchar({ length: 300 }).notNull(),
	languageCode: varchar("language_code", { length: 10 }).default('ja').notNull(),
	category: varchar({ length: 60 }).notNull(),
	usageTip: text("usage_tip"),
	formalityLevel: varchar("formality_level", { length: 20 }).default('polite').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "vocabulary_scenario_id_scenarios_id_fk"
		}).onDelete("cascade"),
]);

export const sessions = pgTable("sessions", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	scenarioId: integer("scenario_id").notNull(),
	situationId: integer("situation_id"),
	characterId: integer("character_id"),
	instanceId: varchar("instance_id", { length: 255 }),
	behaviorMode: varchar("behavior_mode", { length: 20 }).default('standard').notNull(),
	phase: varchar({ length: 20 }).default('icebreaker').notNull(),
	icebreakerIndex: integer("icebreaker_index").default(0).notNull(),
	runningScore: integer("running_score").default(100).notNull(),
	pendingRetryCorrectionId: integer("pending_retry_correction_id"),
	targetLanguage: varchar("target_language", { length: 10 }).default('ja').notNull(),
	nativeLanguage: varchar("native_language", { length: 10 }).default('en').notNull(),
	sessionNumber: integer("session_number").notNull(),
	status: varchar({ length: 20 }).default('active').notNull(),
	totalTurns: integer("total_turns").default(0).notNull(),
	phaseTurnCount: integer("phase_turn_count").default(0).notNull(),
	vocabularyScore: integer("vocabulary_score"),
	grammarScore: integer("grammar_score"),
	fluencyScore: integer("fluency_score"),
	culturalScore: integer("cultural_score"),
	taskScore: integer("task_score"),
	feedback: text(),
	avatarEnabled: boolean("avatar_enabled").default(false).notNull(),
	voiceGender: varchar("voice_gender", { length: 10 }).default('female').notNull(),
	expressionAppropriatenessScore: integer("expression_appropriateness_score"),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "sessions_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "sessions_scenario_id_scenarios_id_fk"
		}),
	foreignKey({
			columns: [table.situationId],
			foreignColumns: [situations.id],
			name: "sessions_situation_id_situations_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.characterId],
			foreignColumns: [characters.id],
			name: "sessions_character_id_characters_id_fk"
		}).onDelete("set null"),
]);

export const characters = pgTable("characters", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 60 }).notNull(),
	role: varchar({ length: 150 }).notNull(),
	personality: text().notNull(),
	avatarColor: varchar("avatar_color", { length: 20 }).notNull(),
	avatarIcon: varchar("avatar_icon", { length: 40 }).notNull(),
	voiceType: varchar("voice_type", { length: 80 }).notNull(),
	gender: varchar({ length: 10 }),
	avatarModelUrl: text("avatar_model_url"),
	defaultForDomainId: integer("default_for_domain_id"),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.defaultForDomainId],
			foreignColumns: [domains.id],
			name: "characters_default_for_domain_id_domains_id_fk"
		}).onDelete("set null"),
]);

export const users = pgTable("users", {
	id: text().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	email: varchar({ length: 150 }).notNull(),
	passwordHash: varchar("password_hash", { length: 255 }),
	level: varchar({ length: 20 }).default('beginner').notNull(),
	xp: integer().default(0).notNull(),
	xpToNext: integer("xp_to_next").default(1000).notNull(),
	tier: varchar({ length: 20 }).default('premium').notNull(),
	nativeLanguage: varchar("native_language", { length: 10 }).default('en').notNull(),
	preferredTargetLanguage: varchar("preferred_target_language", { length: 10 }).default('ja').notNull(),
	streak: integer().default(0).notNull(),
	lastActiveDate: varchar("last_active_date", { length: 10 }),
	avatarSrc: text("avatar_src"),
	consentToDataSharing: boolean("consent_to_data_sharing").default(false).notNull(),
	authProvider: varchar("auth_provider", { length: 20 }).default('credentials').notNull(),
	googleId: varchar("google_id", { length: 255 }),
	learningGoal: varchar("learning_goal", { length: 30 }),
	preferredDomainId: integer("preferred_domain_id"),
	preferredMode: varchar("preferred_mode", { length: 10 }),
	ageRange: varchar("age_range", { length: 10 }),
	dailyGoalMinutes: integer("daily_goal_minutes").default(30).notNull(),
	onboardingCompletedAt: timestamp("onboarding_completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.preferredDomainId],
			foreignColumns: [domains.id],
			name: "users_preferred_domain_id_domains_id_fk"
		}),
	unique("users_email_unique").on(table.email),
]);

export const scenarios = pgTable("scenarios", {
	id: serial().primaryKey().notNull(),
	title: varchar({ length: 120 }).notNull(),
	context: text().notNull(),
	businessType: varchar("business_type", { length: 80 }).notNull(),
	difficulty: varchar({ length: 20 }).default('beginner').notNull(),
	domain: varchar({ length: 40 }).default('daily_life').notNull(),
	aiCharacterName: varchar("ai_character_name", { length: 80 }).notNull(),
	aiCharacterRole: varchar("ai_character_role", { length: 150 }).notNull(),
	userCharacterName: varchar("user_character_name", { length: 80 }).notNull(),
	userCharacterRole: varchar("user_character_role", { length: 150 }).notNull(),
	learningGoals: text("learning_goals").notNull(),
	situationId: integer("situation_id"),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.situationId],
			foreignColumns: [situations.id],
			name: "scenarios_situation_id_situations_id_fk"
		}).onDelete("set null"),
]);

export const userAvatars = pgTable("user_avatars", {
	id: serial().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	avatarUrl: text("avatar_url").notNull(),
	thumbnailUrl: text("thumbnail_url"),
	isSelected: boolean("is_selected").default(false).notNull(),
	source: varchar({ length: 20 }).default('avaturn').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_avatars_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const vocabularyEncounters = pgTable("vocabulary_encounters", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	conversationId: integer("conversation_id"),
	vocabularyId: integer("vocabulary_id"),
	usedCorrectly: boolean("used_correctly").notNull(),
	attemptNumber: integer("attempt_number").default(1).notNull(),
	accuracyScore: integer("accuracy_score"),
	phase: varchar({ length: 20 }).default('icebreaker').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [sessions.id],
			name: "vocabulary_encounters_session_id_sessions_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "vocabulary_encounters_conversation_id_conversations_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.vocabularyId],
			foreignColumns: [vocabulary.id],
			name: "vocabulary_encounters_vocabulary_id_vocabulary_id_fk"
		}).onDelete("set null"),
]);

export const playingWithNeon = pgTable("playing_with_neon", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	value: real(),
});

export const userSettings = pgTable("user_settings", {
	userId: varchar("user_id", { length: 255 }).primaryKey().notNull(),
	uiLanguage: varchar("ui_language", { length: 8 }).default('en'),
	responseLanguage: varchar("response_language", { length: 8 }).default('ja'),
	lastAvatar: varchar("last_avatar", { length: 255 }),
});
