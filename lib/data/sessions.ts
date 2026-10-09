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
  type SessionHistoryFixture,
  type LeaderboardEntry as FixtureLeaderboardEntry,
} from '@/lib/mock-data/sessions';
import type { DataSource } from './result';
import type { SkillLevel } from '@/lib/design-tokens';

export type { UserStats, WeeklyActivity };

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  level: string;
  levelVariant: SkillLevel | 'default';
  xp: number;
  sessionsCompleted: number;
  averageScore: number;
  streak: number;
  isCurrentUser: boolean;
}

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
    const res = await fetch('/api/user/stats', { credentials: 'include' });
    const body = await res.json();
    if (body.success && body.stats) {
      return { stats: body.stats, source: 'live' };
    }
  } catch (err) {
    console.error('[data/sessions] getUserStats failed', err);
  }
  return { stats: null, source: 'fixture' };
}

export async function getSessionHistory(): Promise<{ sessions: SessionHistoryFixture[]; source: DataSource }> {
  try {
    const res = await fetch('/api/sessions', { credentials: 'include' });
    const body = await res.json();
    if (body.success && Array.isArray(body.sessions)) {
      return { sessions: body.sessions, source: 'live' };
    }
  } catch (err) {
    console.error('[data/sessions] getSessionHistory failed', err);
  }
  return { sessions: fixtureHistory, source: 'fixture' };
}

export async function getSessionById(id: number): Promise<{ session: SessionHistoryFixture | null; source: DataSource }> {
  try {
    const res = await fetch(`/api/sessions/${id}`, { credentials: 'include' });
    if (!res.ok) return { session: null, source: 'fixture' };
    const body = await res.json();
    if (body.success) {
      return { session: body.session, source: 'live' };
    }
  } catch (err) {
    console.error(`[data/sessions] getSessionById(${id}) failed`, err);
  }
  return { session: fixtureHistory.find((s) => s.id === id) ?? null, source: 'fixture' };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSkillLevel(value: unknown): value is SkillLevel {
  return value === 'beginner' || value === 'intermediate' || value === 'advanced';
}

function parseLeaderboardEntry(value: unknown, currentUserId?: string): LeaderboardEntry | null {
  if (!isRecord(value)) return null;
  const row = value;
  if (typeof row.userId !== 'string' || typeof row.name !== 'string') return null;

  const rank = toFiniteNumber(row.rank);
  const xp = toFiniteNumber(row.xp);
  const sessionsCompleted = toFiniteNumber(row.sessionsCompleted);
  const averageScore = toFiniteNumber(row.averageScore);
  const streak = toFiniteNumber(row.streak);
  if (rank === null || xp === null || sessionsCompleted === null || averageScore === null || streak === null) {
    return null;
  }

  return {
    rank,
    userId: row.userId,
    name: row.name,
    level: String(row.level),
    levelVariant: isSkillLevel(row.level) ? row.level : 'default',
    xp,
    sessionsCompleted,
    averageScore,
    streak,
    isCurrentUser: currentUserId
      ? row.userId === currentUserId
      : row.isCurrentUser === true,
  };
}

function normalizeFixtureLeaderboard(
  entries: FixtureLeaderboardEntry[],
  currentUserId?: string,
): LeaderboardEntry[] {
  return entries.flatMap((entry) => {
    const normalized = parseLeaderboardEntry(entry, currentUserId);
    return normalized ? [normalized] : [];
  });
}

export async function getLeaderboardGlobal(
  currentUserId?: string,
): Promise<{ entries: LeaderboardEntry[]; source: DataSource }> {
  try {
    const res = await fetch('/api/leaderboard', { credentials: 'include' });
    const body: unknown = await res.json();
    if (isRecord(body) && body.success === true && Array.isArray(body.leaderboard)) {
      return {
        entries: body.leaderboard.flatMap((entry: unknown) => {
          const normalized = parseLeaderboardEntry(entry, currentUserId);
          return normalized ? [normalized] : [];
        }),
        source: 'live',
      };
    }
  } catch (err) {
    console.error('[data/sessions] getLeaderboardGlobal failed', err);
  }
  return {
    entries: normalizeFixtureLeaderboard(fixtureGlobal, currentUserId),
    source: 'fixture',
  };
}

export async function getWeeklyActivity(): Promise<{ data: WeeklyActivity[]; source: DataSource }> {
  try {
    const res = await fetch('/api/sessions', { credentials: 'include' });
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
