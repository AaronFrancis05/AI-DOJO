/* ───────────────────────────────────────────────
   Session fixtures — history for Home/Progress/Leaderboard pages
   Matches the Drizzle `sessions` + `evaluations` table shapes.
   ─────────────────────────────────────────────── */

export interface SessionHistoryFixture {
  id: number;
  scenarioId: number;
  scenarioTitle: string;
  domainSlug: string;
  sessionNumber: number;
  status: 'active' | 'completed';
  totalTurns: number;
  vocabularyScore: number | null;
  grammarScore: number | null;
  fluencyScore: number | null;
  culturalScore: number | null;
  taskScore: number | null;
  feedback: string | null;
  startedAt: string;   // ISO string
  completedAt: string | null;
}

export const sessionHistory: SessionHistoryFixture[] = [
  {
    id: 101,
    scenarioId: 1,
    scenarioTitle: 'Order at the Counter',
    domainSlug: 'restaurant',
    sessionNumber: 3,
    status: 'completed',
    totalTurns: 12,
    vocabularyScore: 25,
    grammarScore: 20,
    fluencyScore: 16,
    culturalScore: 12,
    taskScore: 8,
    feedback: 'Good progress! Your polite forms are improving. Focus on particle usage (を vs が).',
    startedAt: '2025-01-28T10:30:00Z',
    completedAt: '2025-01-28T10:45:00Z',
  },
  {
    id: 102,
    scenarioId: 5,
    scenarioTitle: 'Check In',
    domainSlug: 'hotel',
    sessionNumber: 2,
    status: 'completed',
    totalTurns: 8,
    vocabularyScore: 22,
    grammarScore: 18,
    fluencyScore: 14,
    culturalScore: 10,
    taskScore: 7,
    feedback: 'You handled check-in well. Try varying your response patterns more.',
    startedAt: '2025-01-27T14:00:00Z',
    completedAt: '2025-01-27T14:12:00Z',
  },
  {
    id: 103,
    scenarioId: 8,
    scenarioTitle: 'Check In for a Flight',
    domainSlug: 'airport',
    sessionNumber: 1,
    status: 'completed',
    totalTurns: 10,
    vocabularyScore: 28,
    grammarScore: 22,
    fluencyScore: 18,
    culturalScore: 14,
    taskScore: 9,
    feedback: 'Excellent! Very strong vocabulary use. Keep up the great work.',
    startedAt: '2025-01-26T09:00:00Z',
    completedAt: '2025-01-26T09:18:00Z',
  },
  {
    id: 104,
    scenarioId: 20,
    scenarioTitle: 'Ask for Directions',
    domainSlug: 'travel',
    sessionNumber: 4,
    status: 'completed',
    totalTurns: 6,
    vocabularyScore: 20,
    grammarScore: 16,
    fluencyScore: 12,
    culturalScore: 9,
    taskScore: 6,
    feedback: 'You understood directions well. Practice asking for clarification more.',
    startedAt: '2025-01-25T16:30:00Z',
    completedAt: '2025-01-25T16:38:00Z',
  },
  {
    id: 105,
    scenarioId: 17,
    scenarioTitle: 'Introduce Yourself',
    domainSlug: 'workplace',
    sessionNumber: 1,
    status: 'completed',
    totalTurns: 7,
    vocabularyScore: 18,
    grammarScore: 15,
    fluencyScore: 11,
    culturalScore: 8,
    taskScore: 5,
    feedback: 'A solid first attempt. Work on keigo forms for self-introductions.',
    startedAt: '2025-01-24T11:00:00Z',
    completedAt: '2025-01-24T11:10:00Z',
  },
  {
    id: 106,
    scenarioId: 11,
    scenarioTitle: 'Describe Symptoms',
    domainSlug: 'hospital',
    sessionNumber: 2,
    status: 'completed',
    totalTurns: 9,
    vocabularyScore: 24,
    grammarScore: 19,
    fluencyScore: 15,
    culturalScore: 11,
    taskScore: 7,
    feedback: 'Good symptom descriptions! Remember が for pain locations.',
    startedAt: '2025-01-23T13:00:00Z',
    completedAt: '2025-01-23T13:14:00Z',
  },
  {
    id: 107,
    scenarioId: 1,
    scenarioTitle: 'Order at the Counter',
    domainSlug: 'restaurant',
    sessionNumber: 2,
    status: 'completed',
    totalTurns: 10,
    vocabularyScore: 21,
    grammarScore: 17,
    fluencyScore: 13,
    culturalScore: 10,
    taskScore: 7,
    feedback: 'Better than session 1! Your sentence structure is more natural now.',
    startedAt: '2025-01-22T18:00:00Z',
    completedAt: '2025-01-22T18:15:00Z',
  },
  {
    id: 108,
    scenarioId: 14,
    scenarioTitle: 'Ask About a Product',
    domainSlug: 'shopping',
    sessionNumber: 1,
    status: 'completed',
    totalTurns: 8,
    vocabularyScore: 19,
    grammarScore: 16,
    fluencyScore: 12,
    culturalScore: 9,
    taskScore: 6,
    feedback: 'You managed the transaction. Practice いくらですか with different items.',
    startedAt: '2025-01-21T15:00:00Z',
    completedAt: '2025-01-21T15:10:00Z',
  },
  {
    id: 109,
    scenarioId: 23,
    scenarioTitle: 'Meet a Neighbour',
    domainSlug: 'daily-life',
    sessionNumber: 1,
    status: 'completed',
    totalTurns: 6,
    vocabularyScore: 16,
    grammarScore: 14,
    fluencyScore: 10,
    culturalScore: 7,
    taskScore: 5,
    feedback: 'Good first attempt! Small talk is challenging — keep practising.',
    startedAt: '2025-01-20T10:00:00Z',
    completedAt: '2025-01-20T10:08:00Z',
  },
  {
    id: 110,
    scenarioId: 1,
    scenarioTitle: 'Order at the Counter',
    domainSlug: 'restaurant',
    sessionNumber: 4,
    status: 'active',
    totalTurns: 5,
    vocabularyScore: null,
    grammarScore: null,
    fluencyScore: null,
    culturalScore: null,
    taskScore: null,
    feedback: null,
    startedAt: '2025-01-29T09:00:00Z',
    completedAt: null,
  },
];

/* ── Computed stats for the user ───────────── */

export interface UserStats {
  totalSessions: number;
  completedSessions: number;
  totalSpeakingTime: number;    // in minutes
  averageAccuracy: number;      // percentage
  newWordsLearned: number;
  currentStreak: number;        // days
  longestStreak: number;
  totalXP: number;
  level: number;
}

export const userStats: UserStats = {
  totalSessions: 47,
  completedSessions: 42,
  totalSpeakingTime: 285,
  averageAccuracy: 78,
  newWordsLearned: 340,
  currentStreak: 5,
  longestStreak: 14,
  totalXP: 4850,
  level: 7,
};

/* ── Weekly activity data for charts ───────── */

export interface WeeklyActivity {
  day: string;   // Mon, Tue, Wed...
  sessions: number;
  minutes: number;
}

export const weeklyActivity: WeeklyActivity[] = [
  { day: 'Mon', sessions: 2, minutes: 24 },
  { day: 'Tue', sessions: 3, minutes: 35 },
  { day: 'Wed', sessions: 1, minutes: 12 },
  { day: 'Thu', sessions: 4, minutes: 48 },
  { day: 'Fri', sessions: 2, minutes: 20 },
  { day: 'Sat', sessions: 0, minutes: 0 },
  { day: 'Sun', sessions: 3, minutes: 30 },
];

/* ── Achievements ──────────────────────────── */

export interface Achievement {
  id: number;
  label: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export const recentAchievements: Achievement[] = [
  { id: 1, label: 'First Steps',       icon: 'Footprints',      unlocked: true,  unlockedAt: '2025-01-15' },
  { id: 2, label: 'Conversation Pro',  icon: 'MessageSquare',   unlocked: true,  unlockedAt: '2025-01-20' },
  { id: 3, label: 'Vocabulary Builder',icon: 'BookOpen',        unlocked: true,  unlockedAt: '2025-01-25' },
  { id: 4, label: 'Streak Master',     icon: 'Flame',           unlocked: false },
  { id: 5, label: 'Grammar Guru',      icon: 'PenTool',         unlocked: false },
  { id: 6, label: 'Culture Explorer',  icon: 'Globe',           unlocked: false },
];

/* ── Leaderboard data ──────────────────────── */

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  level: number;
  xp: number;
  sessionsCompleted: number;
  averageScore: number;
  streak: number;
  isCurrentUser: boolean;
}

export const leaderboardGlobal: LeaderboardEntry[] = [
  { rank: 1,  userId: 'u1',  name: 'Sakura Hayashi',  level: 14, xp: 12450, sessionsCompleted: 98,  averageScore: 92, streak: 23, isCurrentUser: false },
  { rank: 2,  userId: 'u2',  name: 'Kenji Nakamura',  level: 12, xp: 10820, sessionsCompleted: 85,  averageScore: 88, streak: 18, isCurrentUser: false },
  { rank: 3,  userId: 'u3',  name: 'Yuki Tanaka',     level: 11, xp: 9600,  sessionsCompleted: 76,  averageScore: 85, streak: 14, isCurrentUser: false },
  { rank: 4,  userId: 'u4',  name: 'Alex Kim',        level: 7,  xp: 4850,  sessionsCompleted: 42,  averageScore: 78, streak: 5,  isCurrentUser: true },
  { rank: 5,  userId: 'u5',  name: 'Maria Santos',    level: 9,  xp: 7200,  sessionsCompleted: 60,  averageScore: 81, streak: 10, isCurrentUser: false },
  { rank: 6,  userId: 'u6',  name: 'James Ochieng',   level: 8,  xp: 6300,  sessionsCompleted: 52,  averageScore: 76, streak: 8,  isCurrentUser: false },
  { rank: 7,  userId: 'u7',  name: 'Lisa Chen',       level: 10, xp: 8400,  sessionsCompleted: 68,  averageScore: 83, streak: 12, isCurrentUser: false },
  { rank: 8,  userId: 'u8',  name: 'Ahmed Hassan',    level: 6,  xp: 3900,  sessionsCompleted: 34,  averageScore: 72, streak: 4,  isCurrentUser: false },
  { rank: 9,  userId: 'u9',  name: 'Priya Sharma',    level: 5,  xp: 3100,  sessionsCompleted: 28,  averageScore: 70, streak: 3,  isCurrentUser: false },
  { rank: 10, userId: 'u10', name: 'Tom Wilson',      level: 4,  xp: 2400,  sessionsCompleted: 20,  averageScore: 65, streak: 2,  isCurrentUser: false },
];

export const leaderboardFriends: LeaderboardEntry[] = [
  { rank: 1,  userId: 'u4',  name: 'Alex Kim',        level: 7,  xp: 4850,  sessionsCompleted: 42,  averageScore: 78, streak: 5,  isCurrentUser: true },
  { rank: 2,  userId: 'u11', name: 'Maya Patel',      level: 6,  xp: 4100,  sessionsCompleted: 35,  averageScore: 74, streak: 7,  isCurrentUser: false },
  { rank: 3,  userId: 'u12', name: 'Ryan Chen',       level: 5,  xp: 3200,  sessionsCompleted: 28,  averageScore: 69, streak: 3,  isCurrentUser: false },
  { rank: 4,  userId: 'u13', name: 'Emma Williams',   level: 4,  xp: 2800,  sessionsCompleted: 22,  averageScore: 67, streak: 2,  isCurrentUser: false },
  { rank: 5,  userId: 'u14', name: 'Daniel Kim',      level: 3,  xp: 1900,  sessionsCompleted: 15,  averageScore: 62, streak: 1,  isCurrentUser: false },
];

/* ── Messages data ─────────────────────────── */

export interface MessageThread {
  id: number;
  otherUserName: string;
  otherUserAvatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
}

export const messageThreads: MessageThread[] = [
  { id: 1, otherUserName: 'Maya Patel',         otherUserAvatar: '#2D3BC5', lastMessage: 'Thanks for the session tip!',          lastMessageTime: '2025-01-29T10:30:00Z', unread: true },
  { id: 2, otherUserName: 'AI Dojo Support',    otherUserAvatar: '#2FAE66', lastMessage: 'Your subscription is expiring soon.', lastMessageTime: '2025-01-28T14:00:00Z', unread: true },
  { id: 3, otherUserName: 'Sakura Hayashi',     otherUserAvatar: '#D14343', lastMessage: 'Great practice session today!',       lastMessageTime: '2025-01-27T16:00:00Z', unread: false },
  { id: 4, otherUserName: 'Sensei Takeda',      otherUserAvatar: '#E3A939', lastMessage: 'Your progress report is ready.',      lastMessageTime: '2025-01-26T09:00:00Z', unread: false },
];

/* ── Calendar events ───────────────────────── */

export interface CalendarEvent {
  id: number;
  title: string;
  date: string;        // YYYY-MM-DD
  time?: string;
  type: 'practice' | 'review' | 'session';
}

export const calendarEvents: CalendarEvent[] = [
  { id: 1, title: 'Morning Practice',    date: '2025-01-29', time: '08:00', type: 'practice' },
  { id: 2, title: 'Restaurant Session',  date: '2025-01-30', time: '12:00', type: 'session' },
  { id: 3, title: 'Progress Review',     date: '2025-01-31', time: '10:00', type: 'review' },
  { id: 4, title: 'Airport Roleplay',    date: '2025-02-01', time: '14:00', type: 'session' },
  { id: 5, title: 'Weekly Assessment',   date: '2025-02-02', time: '09:00', type: 'review' },
];
