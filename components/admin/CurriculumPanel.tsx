'use client';

/* ───────────────────────────────────────────────
   The course tree: courses → levels → units → lessons → phases.

   Structure only. Whether a course is *visible to learners* is the Courses
   tab's job — the publish toggle lives there so there is one place to look for
   it, and archiving here would be a second control over the same column.

   Field lists mirror `ENTITY_SPECS` in `lib/admin/curriculum.ts`, which is
   server-only (it holds table references) and is the authority on what may be
   written. These are the labels and widgets for the same columns.
   ─────────────────────────────────────────────── */

import { EntityTree, type TreeLevel } from '@/components/admin/EntityTree';

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

/** `lesson_phases.phaseKey` — bookkeeping for the course page, unrelated to the
 *  runtime `SessionPhase` a roleplay walks through. */
const PHASE_KEYS = ['learn', 'practice', 'apply', 'review'] as const;

const LEVELS: TreeLevel[] = [
  {
    entity: 'courses',
    label: 'course',
    plural: 'Courses',
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'slug', label: 'Slug', required: true, hint: 'The URL segment: /courses/<slug>. Changing it breaks existing links.' },
      { key: 'description', label: 'Description', widget: 'textarea' },
      { key: 'difficulty', label: 'Difficulty', widget: 'select', options: DIFFICULTIES },
      { key: 'icon', label: 'Icon', hint: 'A lucide-react icon name, e.g. GraduationCap.' },
      { key: 'displayOrder', label: 'Order', widget: 'number' },
    ],
  },
  {
    entity: 'levels',
    label: 'level',
    plural: 'Levels',
    reorderable: true,
    archivable: true,
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'description', label: 'Description', widget: 'textarea' },
      { key: 'requiredXp', label: 'Required XP', widget: 'number', hint: 'XP a learner needs before this level unlocks.' },
    ],
  },
  {
    entity: 'units',
    label: 'unit',
    plural: 'Units',
    // Reordered with the up/down controls, which write `sequenceOrder`. There
    // is no editable Order field here: `displayOrder` is a second, unused
    // column, and offering it looked like the reorder control had no effect.
    reorderable: true,
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'description', label: 'Description', widget: 'textarea' },
    ],
  },
  {
    entity: 'lessons',
    label: 'lesson',
    plural: 'Lessons',
    reorderable: true,
    archivable: true,
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'summary', label: 'Summary', widget: 'textarea' },
      {
        key: 'scenarioId',
        label: 'Scenario id',
        widget: 'number',
        nullable: true,
        hint: 'The roleplay this lesson runs, from the Catalogue tab. Leave blank to detach it.',
      },
      { key: 'estimatedMinutes', label: 'Minutes', widget: 'number' },
    ],
  },
  {
    entity: 'phases',
    label: 'lesson phase',
    plural: 'Phases',
    reorderable: true,
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'objective', label: 'Objective', widget: 'textarea' },
      { key: 'phaseKey', label: 'Phase', widget: 'select', options: PHASE_KEYS },
      { key: 'durationMinutes', label: 'Minutes', widget: 'number' },
    ],
  },
];

export function CurriculumPanel({ onError }: { onError: (msg: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-dojo-text-muted">
        Deleting a node takes everything beneath it — including every learner&apos;s progress
        through those lessons. The console counts what would go first and asks; archive a level or
        lesson instead when the content still matters.
      </p>
      <EntityTree basePath="/api/admin/curriculum" levels={LEVELS} onError={onError} />
    </div>
  );
}
