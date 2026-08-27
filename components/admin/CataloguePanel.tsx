'use client';

/* ───────────────────────────────────────────────
   The roleplay catalogue: domains → situations → scenarios.

   Separate from the Curriculum tab because the foreign keys behave differently
   and the difference is the whole risk — see the header of
   `app/api/admin/catalogue/[entity]/route.ts`. Deleting a domain orphans the
   scenarios beneath it rather than removing them, and a scenario someone has
   already practised cannot be deleted at all. Both refusals arrive as a 409
   with the count in them.

   There is no reorder here: unlike the curriculum tables these rows carry a
   plain `displayOrder` with no unique constraint, so position is just a field
   to edit.
   ─────────────────────────────────────────────── */

import { EntityTree, type TreeLevel } from '@/components/admin/EntityTree';

const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const BEHAVIOR_MODES = ['standard', 'trouble'] as const;

const LEVELS: TreeLevel[] = [
  {
    entity: 'domains',
    label: 'domain',
    plural: 'Domains',
    titleKey: 'name',
    archivable: true,
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'slug', label: 'Slug', required: true, hint: 'The URL segment: /dojo/<slug>.' },
      { key: 'description', label: 'Description', widget: 'textarea' },
      { key: 'icon', label: 'Icon', hint: 'One of the lucide names the hub maps: UtensilsCrossed, Building2, Plane, HeartPulse, ShoppingBag, Briefcase, Compass, Sun.' },
      { key: 'heroGradientFrom', label: 'Hero gradient from', hint: 'Hex, e.g. #6366f1 — a per-domain brand colour, not a design token.' },
      { key: 'heroGradientTo', label: 'Hero gradient to' },
      { key: 'imageUrl', label: 'Hero image URL', nullable: true },
      { key: 'displayOrder', label: 'Order', widget: 'number' },
    ],
  },
  {
    entity: 'situations',
    label: 'situation',
    plural: 'Situations',
    archivable: true,
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'context', label: 'Context', widget: 'textarea', hint: 'What is happening, where, and why. This reaches the prompt.' },
      { key: 'learningGoals', label: 'Learning goals', widget: 'textarea', hint: 'One per line.' },
      { key: 'focusPills', label: 'Focus pills', hint: 'The chips shown on the situation picker.' },
      { key: 'skillLevel', label: 'Skill level', widget: 'select', options: SKILL_LEVELS },
      { key: 'behaviorMode', label: 'Behaviour mode', widget: 'select', options: BEHAVIOR_MODES },
      { key: 'displayOrder', label: 'Order', widget: 'number' },
    ],
  },
  {
    entity: 'scenarios',
    label: 'scenario',
    plural: 'Scenarios',
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'context', label: 'Context', widget: 'textarea' },
      { key: 'learningGoals', label: 'Learning goals', widget: 'textarea' },
      { key: 'businessType', label: 'Business type' },
      { key: 'difficulty', label: 'Difficulty', widget: 'select', options: SKILL_LEVELS },
      { key: 'domain', label: 'Domain slug', hint: 'Denormalised copy of the parent domain’s slug — keep it in step by hand.' },
      { key: 'aiCharacterName', label: 'AI character name' },
      { key: 'aiCharacterRole', label: 'AI character role' },
      { key: 'userCharacterName', label: 'Learner character name' },
      { key: 'userCharacterRole', label: 'Learner character role' },
      { key: 'displayOrder', label: 'Order', widget: 'number' },
    ],
  },
];

export function CataloguePanel({ onError }: { onError: (msg: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-dojo-text-muted">
        These rows are cached for an hour, so an edit here is invalidated on write rather than
        waiting the TTL out. A scenario that has already been practised cannot be deleted — its
        sessions and reports point at it — and archiving the situation above it is the way to take
        it off the hub.
      </p>
      <EntityTree basePath="/api/admin/catalogue" levels={LEVELS} onError={onError} />
    </div>
  );
}
