/**
 * The pre-lesson briefing (PLAN.md 4.1): what a tutor should know about a
 * learner before the call starts.
 *
 * - their CEFR level, and where they are in the syllabus (4.7);
 * - what they keep getting wrong: the open weak points from Phase 3;
 * - their last three AI sessions, with scores and the key corrections;
 * - whether they are doing their homework (study-pack status);
 * - the notes from their last lesson with a tutor, so lessons build on each other.
 *
 * Callers must have checked that the tutor has a booking with the learner.
 */

import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  conversations,
  corrections,
  learnerWeakPoints,
  scenarios,
  sessions,
  studyPacks,
  tutorBookings,
  users,
} from '@/src/schema';
import { getNativeLangName, getTargetLangConfig } from '@/lib/language';
import { isCefrLevel, type CefrLevel } from '@/lib/interview/cefr';
import { nextSyllabusStep, type NextSyllabusStep } from '@/lib/courses/syllabus-data';
import type { TurnScores } from '@/lib/ai-engine';

const WEAK_POINT_LIMIT = 5;
const SESSION_LIMIT = 3;
const CORRECTIONS_PER_SESSION = 3;

export interface BriefingWeakPoint {
  id: number;
  category: string;
  pattern: string;
  example: string | null;
  count: number;
  lastSeenAt: Date;
}

export interface BriefingSession {
  id: number;
  scenarioTitle: string;
  completedAt: Date | null;
  scores: TurnScores | null;
  corrections: { original: string; corrected: string; explanation: string }[];
}

export interface Briefing {
  learner: {
    id: string;
    name: string;
    nativeLanguage: string;
    nativeLanguageName: string;
    cefrLevel: CefrLevel | null;
    cefrAssessedAt: Date | null;
    level: string;
  };
  targetLanguage: string;
  targetLanguageName: string;
  syllabus: NextSyllabusStep | null;
  weakPoints: BriefingWeakPoint[];
  sessions: BriefingSession[];
  studyPacks: { ready: number; opened: number; completed: number; latestAt: Date | null };
  lastLesson: { scheduledAt: Date; notes: string | null } | null;
}

function sessionScores(row: {
  vocabularyScore: number | null;
  grammarScore: number | null;
  fluencyScore: number | null;
  culturalScore: number | null;
  taskScore: number | null;
  expressionAppropriatenessScore: number | null;
}): TurnScores | null {
  if (row.vocabularyScore == null) return null;
  return {
    vocabulary: row.vocabularyScore,
    grammar: row.grammarScore ?? 0,
    fluency: row.fluencyScore ?? 0,
    cultural: row.culturalScore ?? 0,
    task: row.taskScore ?? 0,
    expressionAppropriateness: row.expressionAppropriatenessScore ?? 0,
  };
}

export async function loadBriefing(input: {
  learnerId: string;
  targetLanguage: string;
  tutorId: number;
}): Promise<Briefing | null> {
  const { learnerId, targetLanguage, tutorId } = input;

  const [learner] = await db
    .select({
      id: users.id,
      name: users.name,
      nativeLanguage: users.nativeLanguage,
      cefrLevel: users.cefrLevel,
      cefrAssessedAt: users.cefrAssessedAt,
      level: users.level,
    })
    .from(users)
    .where(eq(users.id, learnerId))
    .limit(1);
  if (!learner) return null;

  const cefrLevel = isCefrLevel(learner.cefrLevel) ? learner.cefrLevel : null;

  const [weakPoints, recentSessions, packRows, lastLessonRow, syllabus] = await Promise.all([
    db
      .select({
        id: learnerWeakPoints.id,
        category: learnerWeakPoints.category,
        pattern: learnerWeakPoints.pattern,
        example: learnerWeakPoints.example,
        count: learnerWeakPoints.count,
        lastSeenAt: learnerWeakPoints.lastSeenAt,
      })
      .from(learnerWeakPoints)
      .where(and(
        eq(learnerWeakPoints.userId, learnerId),
        eq(learnerWeakPoints.targetLanguage, targetLanguage),
        isNull(learnerWeakPoints.resolvedAt),
      ))
      .orderBy(desc(learnerWeakPoints.count), desc(learnerWeakPoints.lastSeenAt))
      .limit(WEAK_POINT_LIMIT),
    db
      .select({
        id: sessions.id,
        scenarioTitle: scenarios.title,
        completedAt: sessions.completedAt,
        vocabularyScore: sessions.vocabularyScore,
        grammarScore: sessions.grammarScore,
        fluencyScore: sessions.fluencyScore,
        culturalScore: sessions.culturalScore,
        taskScore: sessions.taskScore,
        expressionAppropriatenessScore: sessions.expressionAppropriatenessScore,
      })
      .from(sessions)
      .innerJoin(scenarios, eq(sessions.scenarioId, scenarios.id))
      .where(and(
        eq(sessions.userId, learnerId),
        eq(sessions.targetLanguage, targetLanguage),
        eq(sessions.status, 'completed'),
      ))
      .orderBy(desc(sessions.completedAt))
      .limit(SESSION_LIMIT),
    db
      .select({ status: studyPacks.status, createdAt: studyPacks.createdAt })
      .from(studyPacks)
      .where(and(eq(studyPacks.userId, learnerId), eq(studyPacks.targetLanguage, targetLanguage)))
      .orderBy(desc(studyPacks.createdAt))
      .limit(20),
    // This tutor's own last lesson with them. Another tutor's notes are that
    // tutor's, and a learner who switches tutors has not shared them.
    db
      .select({ scheduledAt: tutorBookings.scheduledAt, notes: tutorBookings.lessonNotes })
      .from(tutorBookings)
      .where(and(
        eq(tutorBookings.tutorId, tutorId),
        eq(tutorBookings.learnerId, learnerId),
        isNotNull(tutorBookings.notesFiledAt),
      ))
      .orderBy(desc(tutorBookings.scheduledAt))
      .limit(1),
    nextSyllabusStep(learnerId, targetLanguage, cefrLevel),
  ]);

  const sessionIds = recentSessions.map((s) => s.id);
  const correctionRows = sessionIds.length === 0 ? [] : await db
    .select({
      sessionId: conversations.sessionId,
      original: corrections.originalText,
      corrected: corrections.correctedText,
      explanation: corrections.explanation,
      severity: corrections.severity,
    })
    .from(corrections)
    .innerJoin(conversations, eq(corrections.conversationId, conversations.id))
    .where(inArray(conversations.sessionId, sessionIds))
    .orderBy(desc(corrections.id));

  // "Key" corrections: the most severe first, a few per session.
  const severityRank = (s: string) => (s === 'major' ? 0 : s === 'moderate' ? 1 : 2);
  const bySession = new Map<number, BriefingSession['corrections']>();
  for (const c of [...correctionRows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))) {
    const list = bySession.get(c.sessionId) ?? [];
    if (list.length < CORRECTIONS_PER_SESSION) {
      list.push({ original: c.original, corrected: c.corrected, explanation: c.explanation });
    }
    bySession.set(c.sessionId, list);
  }

  const studyPackSummary = { ready: 0, opened: 0, completed: 0, latestAt: packRows[0]?.createdAt ?? null };
  for (const p of packRows) {
    if (p.status === 'ready' || p.status === 'opened' || p.status === 'completed') studyPackSummary[p.status]++;
  }

  return {
    learner: {
      id: learner.id,
      name: learner.name,
      nativeLanguage: learner.nativeLanguage,
      nativeLanguageName: getNativeLangName(learner.nativeLanguage),
      cefrLevel,
      cefrAssessedAt: learner.cefrAssessedAt,
      level: learner.level,
    },
    targetLanguage,
    targetLanguageName: getTargetLangConfig(targetLanguage).name,
    syllabus,
    weakPoints,
    sessions: recentSessions.map((s) => ({
      id: s.id,
      scenarioTitle: s.scenarioTitle,
      completedAt: s.completedAt,
      scores: sessionScores(s),
      corrections: bySession.get(s.id) ?? [],
    })),
    studyPacks: studyPackSummary,
    lastLesson: lastLessonRow[0] ?? null,
  };
}
