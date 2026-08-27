/**
 * The curriculum tree, as data the admin routes can act on generically.
 *
 * `courses → course_levels → units → lessons → lesson_phases` are five tables
 * with the same shape of problem: create, rename, reorder, archive or delete a
 * node that has a parent and a `sequenceOrder`. Describing them once here means
 * `/api/admin/curriculum/[entity]` is one implementation instead of five
 * near-identical route files that would drift.
 *
 * Server-only: it holds table references.
 */

import { courseLevels, courses, lessonPhases, lessons, units } from '@/src/schema';

export const CURRICULUM_ENTITIES = ['courses', 'levels', 'units', 'lessons', 'phases'] as const;
export type CurriculumEntity = (typeof CURRICULUM_ENTITIES)[number];

export function isCurriculumEntity(value: unknown): value is CurriculumEntity {
  return typeof value === 'string' && (CURRICULUM_ENTITIES as readonly string[]).includes(value);
}

export interface EntitySpec {
  table:
    | typeof courses
    | typeof courseLevels
    | typeof units
    | typeof lessons
    | typeof lessonPhases;
  /** The FK column naming this node's parent, or null for the root. */
  parentColumn: string | null;
  /** Editable text/number columns, and how far each may be trimmed. */
  fields: Record<string, { max?: number; type: 'string' | 'number' | 'boolean' }>;
  /** True when the table has `isActive`, i.e. archiving is available. */
  archivable: boolean;
  /** Child entity, so a delete can say what it would take with it. */
  child: CurriculumEntity | null;
  label: string;
}

export const ENTITY_SPECS: Record<CurriculumEntity, EntitySpec> = {
  courses: {
    table: courses,
    parentColumn: null,
    fields: {
      slug: { max: 60, type: 'string' },
      title: { max: 120, type: 'string' },
      description: { type: 'string' },
      difficulty: { max: 20, type: 'string' },
      icon: { max: 40, type: 'string' },
      displayOrder: { type: 'number' },
      isActive: { type: 'boolean' },
    },
    archivable: true,
    child: 'levels',
    label: 'course',
  },
  levels: {
    table: courseLevels,
    parentColumn: 'courseId',
    fields: {
      title: { max: 120, type: 'string' },
      description: { type: 'string' },
      sequenceOrder: { type: 'number' },
      requiredXp: { type: 'number' },
      isActive: { type: 'boolean' },
    },
    archivable: true,
    child: 'units',
    label: 'level',
  },
  units: {
    table: units,
    parentColumn: 'levelId',
    fields: {
      title: { max: 120, type: 'string' },
      description: { type: 'string' },
      sequenceOrder: { type: 'number' },
      displayOrder: { type: 'number' },
    },
    archivable: false,
    child: 'lessons',
    label: 'unit',
  },
  lessons: {
    table: lessons,
    parentColumn: 'unitId',
    fields: {
      title: { max: 120, type: 'string' },
      summary: { type: 'string' },
      sequenceOrder: { type: 'number' },
      scenarioId: { type: 'number' },
      estimatedMinutes: { type: 'number' },
      displayOrder: { type: 'number' },
      isActive: { type: 'boolean' },
    },
    archivable: true,
    child: 'phases',
    label: 'lesson',
  },
  phases: {
    table: lessonPhases,
    parentColumn: 'lessonId',
    fields: {
      title: { max: 120, type: 'string' },
      objective: { type: 'string' },
      phaseKey: { max: 20, type: 'string' },
      sequenceOrder: { type: 'number' },
      durationMinutes: { type: 'number' },
    },
    archivable: false,
    child: null,
    label: 'lesson phase',
  },
};

/**
 * Coerces a request body to the columns this entity actually has.
 *
 * Whitelisted rather than spread: a body is user input, and passing unknown
 * keys through to `.set()` would let a caller write any column on the table,
 * `id` included.
 */
export function readEntityFields(
  spec: EntitySpec,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(spec.fields)) {
    if (body[key] === undefined) continue;

    if (def.type === 'boolean') {
      out[key] = body[key] === true;
    } else if (def.type === 'number') {
      // Explicit null clears a nullable FK (a lesson detached from a scenario).
      if (body[key] === null) {
        out[key] = null;
      } else {
        const n = Number(body[key]);
        if (Number.isFinite(n)) out[key] = Math.round(n);
      }
    } else {
      const raw = body[key];
      if (raw === null) {
        out[key] = null;
      } else if (typeof raw === 'string') {
        const trimmed = def.max ? raw.trim().slice(0, def.max) : raw.trim();
        out[key] = trimmed || null;
      }
    }
  }

  return out;
}
