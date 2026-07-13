/**
 * Session data access layer.
 * Queries live API endpoints. Falls back to fixtures with console.error logging.
 */
import {
  weeklyActivity as fixtureWeekly,
  recentAchievements as fixtureAchievements,
  sessionHistory as fixtureHistory,
  leaderboardGlobal as fixtureGlobal,
  leaderboardFriends as fixtureFriends,
  calendarEvents as fixtureCalendar,
  messageThreads as fixtureMessages,
  type UserStats,
  type WeeklyActivity,
} from '@/lib/mock-data/sessions';
import type { DataSource } from './result';

export type { UserStats, WeeklyActivity };

export {
  fixtureWeekly as weeklyActivity,
  fixtureAchievements as recentAchievements,
  fixtureHistory as sessionHistory,
  fixtureGlobal as leaderboardGlobal,
  fixtureFriends as leaderboardFriends,
  fixtureCalendar as calendarEvents,
  fixtureMessages as messageThreads,
};

/* ── 2a — Directly queried from live data ─────── */

export async function getUserStats(): Promise<{ stats: UserStats | null; source: DataSource }> {
  try {
    const res = await fetch('/api/user/stats');
    const body = await res.json();
    if (body.success && body.stats) {
      return { stats: body.stats, source: 'live' };
    }
  } catch (err) {
    console.error('[data/sessions] getUserStats failed', err);
  }
  return { stats: null, source: 'fixture' };
}

export async function getSessionHistory(): Promise<{ sessions: any[]; source: DataSource }> {
  try {
    const res = await fetch('/api/sessions');
    const body = await res.json();
    if (body.success && Array.isArray(body.sessions)) {
      return { sessions: body.sessions, source: 'live' };
    }
  } catch (err) {
    console.error('[data/sessions] getSessionHistory failed', err);
  }
  return { sessions: fixtureHistory, source: 'fixture' };
}

export async function getSessionById(id: number): Promise<{ session: any | null; source: DataSource }> {
  try {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) return { session: null, source: 'fixture' };
    const body = await res.json();
    if (body.success) {
      return { session: body.session, source: 'live' };
    }
  } catch (err) {
    console.error(`[data/sessions] getSessionById(${id}) failed`, err);
  }
  return { session: fixtureHistory.find((s: any) => s.id === id) ?? null, source: 'fixture' };
}

export async function getLeaderboardGlobal(): Promise<{ entries: any[]; source: DataSource }> {
  try {
    const res = await fetch('/api/leaderboard');
    const body = await res.json();
    if (body.success && Array.isArray(body.leaderboard)) {
      return { entries: body.leaderboard, source: 'live' };
    }
  } catch (err) {
    console.error('[data/sessions] getLeaderboardGlobal failed', err);
  }
  return { entries: fixtureGlobal, source: 'fixture' };
}

export async function getWeeklyActivity(): Promise<{ data: WeeklyActivity[]; source: DataSource }> {
  try {
    const res = await fetch('/api/sessions');
    const body = await res.json();
    if (body.success && Array.isArray(body.sessions)) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const counts: Record<string, number> = {};
      for (const s of body.sessions) {
        if (s.startedAt) {
          const d = new Date(s.startedAt);
          const key = dayNames[d.getDay()];
          counts[key] = (counts[key] ?? 0) + 1;
        }
      }
      const data = dayNames.map(day => ({ day, sessions: counts[day] ?? 0, minutes: (counts[day] ?? 0) * 15 }));
      return { data, source: 'live' };
    }
  } catch (err) {
    console.error('[data/sessions] getWeeklyActivity failed', err);
  }
  return { data: fixtureWeekly, source: 'fixture' };
}

/* ── 2b — Needs product decision — returning fixtures with TODO ── */

export async function getRecentAchievements() {
  return fixtureAchievements;
}

export async function getLeaderboardFriends() {
  return fixtureFriends;
}

/* ── 2c — Calendar now fetches /api/sessions directly in the page ── */

/**
 * getCalendarEvents is no longer used by app/(app)/calendar/page.tsx,
 * which fetches /api/sessions directly and maps sessions into events.
 * This helper remains for any other caller until the fixture path is removed.
 * TODO: Remove this once all callers are confirmed migrated.
 */
export async function getCalendarEvents() {
  return fixtureCalendar;
}

export async function getMessageThreads() {
  return fixtureMessages;
}
