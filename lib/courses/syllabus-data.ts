/**
 * Reading the syllabus and a learner's place in it (PLAN.md 4.7).
 *
 * The syllabus for a language is the course whose `target_language` is that
 * language and whose levels carry a CEFR band. It may be inactive in the
 * catalogue (seeded for teacher review first) and still drive lesson plans
 * and the progress map — those read it directly, not through /api/courses.
 */

import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/src/db';
import { canDoProgress, courseLevels, courses, lessonPhases, lessons, units } from '@/src/schema';
import { compareCefr, type CefrLevel } from '@/lib/interview/cefr';
import {
  isCanDoStatus,
  isUnitAchieved,
  levelCefr,
  parseCanDo,
  type CanDoStatus,
} from './syllabus';

export interface SyllabusUnit {
  id: number;
  title: string;
  description: string | null;
  canDo: { index: number; text: string; status: CanDoStatus | null; confirmed: boolean }[];
  achieved: boolean;
}

export interface SyllabusLevel {
  id: number;
  cefrLevel: CefrLevel;
  title: string;
  units: SyllabusUnit[];
}

export interface SyllabusMap {
  courseId: number;
  courseTitle: string;
  levels: SyllabusLevel[];
}

async function findSyllabusCourse(targetLanguage: string) {
  const [course] = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(eq(courses.targetLanguage, targetLanguage))
    .orderBy(asc(courses.displayOrder), asc(courses.id))
    .limit(1);
  return course ?? null;
}

/** The learner's syllabus, level by level, with their can-do standing. Null when the language has none. */
export async function loadSyllabusMap(userId: string, targetLanguage: string): Promise<SyllabusMap | null> {
  const course = await findSyllabusCourse(targetLanguage);
  if (!course) return null;

  const levelRows = await db
    .select({ id: courseLevels.id, title: courseLevels.title, cefrLevel: courseLevels.cefrLevel })
    .from(courseLevels)
    .where(and(eq(courseLevels.courseId, course.id), isNotNull(courseLevels.cefrLevel)))
    .orderBy(asc(courseLevels.sequenceOrder));
  if (levelRows.length === 0) return null;

  const unitRows = await db
    .select({ id: units.id, levelId: units.levelId, title: units.title, description: units.description, canDo: units.canDo })
    .from(units)
    .where(inArray(units.levelId, levelRows.map((l) => l.id)))
    .orderBy(asc(units.sequenceOrder));

  const progressRows = unitRows.length === 0 ? [] : await db
    .select({
      unitId: canDoProgress.unitId,
      statementIndex: canDoProgress.statementIndex,
      status: canDoProgress.status,
      confirmedAt: canDoProgress.confirmedAt,
    })
    .from(canDoProgress)
    .where(and(eq(canDoProgress.userId, userId), inArray(canDoProgress.unitId, unitRows.map((u) => u.id))));

  const progress = new Map(progressRows.map((p) => [`${p.unitId}:${p.statementIndex}`, p]));

  const levels: SyllabusLevel[] = [];
  for (const level of levelRows) {
    const cefr = levelCefr(level.cefrLevel);
    if (!cefr) continue;
    levels.push({
      id: level.id,
      cefrLevel: cefr,
      title: level.title,
      units: unitRows
        .filter((u) => u.levelId === level.id)
        .map((u) => {
          const canDo = parseCanDo(u.canDo).map((text, index) => {
            const p = progress.get(`${u.id}:${index}`);
            return {
              index,
              text,
              status: p && isCanDoStatus(p.status) ? p.status : null,
              confirmed: p?.confirmedAt != null,
            };
          });
          return {
            id: u.id,
            title: u.title,
            description: u.description,
            canDo,
            achieved: isUnitAchieved(canDo.length, canDo.map((c) => c.status)),
          };
        }),
    });
  }

  return { courseId: course.id, courseTitle: course.title, levels };
}

export interface NextSyllabusStep {
  level: CefrLevel;
  unit: SyllabusUnit;
  /** The unit's tutor lesson — the one carrying the fix_slot phase. */
  lesson: { id: number; title: string; summary: string | null } | null;
}

/**
 * Where the next lesson should start: the first unit not yet achieved, at or
 * above the learner's CEFR level. A learner with no level starts at the
 * bottom, which for English is the A0 Classroom English starter.
 */
export async function nextSyllabusStep(
  userId: string,
  targetLanguage: string,
  learnerLevel: CefrLevel | null,
): Promise<NextSyllabusStep | null> {
  const map = await loadSyllabusMap(userId, targetLanguage);
  if (!map) return null;

  for (const level of map.levels) {
    if (learnerLevel && compareCefr(level.cefrLevel, learnerLevel) < 0) continue;
    const unit = level.units.find((u) => !u.achieved);
    if (!unit) continue;

    const [lesson] = await db
      .select({ id: lessons.id, title: lessons.title, summary: lessons.summary })
      .from(lessons)
      .innerJoin(lessonPhases, eq(lessonPhases.lessonId, lessons.id))
      .where(and(eq(lessons.unitId, unit.id), eq(lessonPhases.phaseKey, 'fix_slot')))
      .limit(1);

    return { level: level.cefrLevel, unit, lesson: lesson ?? null };
  }
  return null;
}

/** The phase objectives of one lesson, in order — the syllabus content a plan teaches. */
export async function loadLessonPhases(lessonId: number) {
  return db
    .select({ phaseKey: lessonPhases.phaseKey, title: lessonPhases.title, objective: lessonPhases.objective })
    .from(lessonPhases)
    .where(eq(lessonPhases.lessonId, lessonId))
    .orderBy(asc(lessonPhases.sequenceOrder));
}
