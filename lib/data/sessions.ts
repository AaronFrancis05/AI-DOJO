/**
 * Session data access layer.
 * Phase 1: wraps fixtures. Phase 2: calls live API.
 *
 * Re-exports mock data directly for synchronous usage by existing pages.
 * New code should prefer the async functions below.
 */
import {
  userStats,
  weeklyActivity,
  recentAchievements,
  sessionHistory,
  leaderboardGlobal,
  leaderboardFriends,
  calendarEvents,
  messageThreads,
  type UserStats,
  type WeeklyActivity,
} from '@/lib/mock-data/sessions';

// Re-export mock data directly for sync usage by existing pages
export {
  userStats,
  weeklyActivity,
  recentAchievements,
  sessionHistory,
  leaderboardGlobal,
  leaderboardFriends,
  calendarEvents,
  messageThreads,
};
export type { UserStats, WeeklyActivity };

export async function getUserStats(): Promise<UserStats> {
  return userStats;
}

export async function getWeeklyActivity(): Promise<WeeklyActivity[]> {
  return weeklyActivity;
}

export async function getRecentAchievements() {
  return recentAchievements;
}

export async function getSessionHistory() {
  return sessionHistory;
}

export async function getSessionById(id: number) {
  return sessionHistory.find(s => s.id === id);
}

export async function getLeaderboardGlobal() {
  return leaderboardGlobal;
}

export async function getLeaderboardFriends() {
  return leaderboardFriends;
}

export async function getCalendarEvents() {
  return calendarEvents;
}

export async function getMessageThreads() {
  return messageThreads;
}
