import { relations } from "drizzle-orm/relations";
import { users, userPreferences, conversations, audioJobs, sessions, evaluations, corrections, goalCompletions, scenarioGoals, domains, situations, scenarios, shareTokens, vocabulary, characters, userAvatars, vocabularyEncounters } from "./schema";

export const userPreferencesRelations = relations(userPreferences, ({one}) => ({
	user: one(users, {
		fields: [userPreferences.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	userPreferences: many(userPreferences),
	evaluations: many(evaluations),
	goalCompletions: many(goalCompletions),
	conversations: many(conversations),
	sessions: many(sessions),
	domain: one(domains, {
		fields: [users.preferredDomainId],
		references: [domains.id]
	}),
	userAvatars: many(userAvatars),
}));

export const audioJobsRelations = relations(audioJobs, ({one}) => ({
	conversation: one(conversations, {
		fields: [audioJobs.conversationId],
		references: [conversations.id]
	}),
	session: one(sessions, {
		fields: [audioJobs.sessionId],
		references: [sessions.id]
	}),
}));

export const conversationsRelations = relations(conversations, ({one, many}) => ({
	audioJobs: many(audioJobs),
	corrections: many(corrections),
	goalCompletions: many(goalCompletions),
	session: one(sessions, {
		fields: [conversations.sessionId],
		references: [sessions.id]
	}),
	user: one(users, {
		fields: [conversations.userId],
		references: [users.id]
	}),
	vocabularyEncounters: many(vocabularyEncounters),
}));

export const sessionsRelations = relations(sessions, ({one, many}) => ({
	audioJobs: many(audioJobs),
	evaluations: many(evaluations),
	goalCompletions: many(goalCompletions),
	conversations: many(conversations),
	shareTokens: many(shareTokens),
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	}),
	scenario: one(scenarios, {
		fields: [sessions.scenarioId],
		references: [scenarios.id]
	}),
	situation: one(situations, {
		fields: [sessions.situationId],
		references: [situations.id]
	}),
	character: one(characters, {
		fields: [sessions.characterId],
		references: [characters.id]
	}),
	vocabularyEncounters: many(vocabularyEncounters),
}));

export const evaluationsRelations = relations(evaluations, ({one}) => ({
	session: one(sessions, {
		fields: [evaluations.sessionId],
		references: [sessions.id]
	}),
	user: one(users, {
		fields: [evaluations.userId],
		references: [users.id]
	}),
}));

export const correctionsRelations = relations(corrections, ({one}) => ({
	conversation: one(conversations, {
		fields: [corrections.conversationId],
		references: [conversations.id]
	}),
}));

export const goalCompletionsRelations = relations(goalCompletions, ({one}) => ({
	session: one(sessions, {
		fields: [goalCompletions.sessionId],
		references: [sessions.id]
	}),
	conversation: one(conversations, {
		fields: [goalCompletions.conversationId],
		references: [conversations.id]
	}),
	user: one(users, {
		fields: [goalCompletions.userId],
		references: [users.id]
	}),
	scenarioGoal: one(scenarioGoals, {
		fields: [goalCompletions.scenarioGoalId],
		references: [scenarioGoals.id]
	}),
}));

export const scenarioGoalsRelations = relations(scenarioGoals, ({one, many}) => ({
	goalCompletions: many(goalCompletions),
	scenario: one(scenarios, {
		fields: [scenarioGoals.scenarioId],
		references: [scenarios.id]
	}),
}));

export const situationsRelations = relations(situations, ({one, many}) => ({
	domain: one(domains, {
		fields: [situations.domainId],
		references: [domains.id]
	}),
	sessions: many(sessions),
	scenarios: many(scenarios),
}));

export const domainsRelations = relations(domains, ({many}) => ({
	situations: many(situations),
	characters: many(characters),
	users: many(users),
}));

export const scenariosRelations = relations(scenarios, ({one, many}) => ({
	scenarioGoals: many(scenarioGoals),
	vocabularies: many(vocabulary),
	sessions: many(sessions),
	situation: one(situations, {
		fields: [scenarios.situationId],
		references: [situations.id]
	}),
}));

export const shareTokensRelations = relations(shareTokens, ({one}) => ({
	session: one(sessions, {
		fields: [shareTokens.sessionId],
		references: [sessions.id]
	}),
}));

export const vocabularyRelations = relations(vocabulary, ({one, many}) => ({
	scenario: one(scenarios, {
		fields: [vocabulary.scenarioId],
		references: [scenarios.id]
	}),
	vocabularyEncounters: many(vocabularyEncounters),
}));

export const charactersRelations = relations(characters, ({one, many}) => ({
	sessions: many(sessions),
	domain: one(domains, {
		fields: [characters.defaultForDomainId],
		references: [domains.id]
	}),
}));

export const userAvatarsRelations = relations(userAvatars, ({one}) => ({
	user: one(users, {
		fields: [userAvatars.userId],
		references: [users.id]
	}),
}));

export const vocabularyEncountersRelations = relations(vocabularyEncounters, ({one}) => ({
	session: one(sessions, {
		fields: [vocabularyEncounters.sessionId],
		references: [sessions.id]
	}),
	conversation: one(conversations, {
		fields: [vocabularyEncounters.conversationId],
		references: [conversations.id]
	}),
	vocabulary: one(vocabulary, {
		fields: [vocabularyEncounters.vocabularyId],
		references: [vocabulary.id]
	}),
}));