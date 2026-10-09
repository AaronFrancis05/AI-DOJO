/**
 * The AI-drafted plan for one 1:1 lesson (PLAN.md 4.7), with the slides the
 * lesson panel shows (4.8 part 3). Prompt and validation, as pure functions.
 *
 * The plan fills the standard template (lib/courses/syllabus.ts): the
 * learner's next syllabus step makes up most of it, and a personal-fix slot
 * takes their top weak points. Phase minutes are computed here, never taken
 * from the model, so a plan always adds up to the booked duration.
 */

import { TUTOR_PHASE_KEYS, type PhaseTiming, type TutorPhaseKey } from '@/lib/courses/syllabus';

export interface LessonPlanPhase {
  key: TutorPhaseKey;
  title: string;
  minutes: number;
  /** Concrete steps, in the order the tutor runs them. */
  activities: string[];
}

export interface LessonPlanFix {
  pattern: string;
  exercise: string;
}

/**
 * One slide on the lesson panel: an English phrase, and that learner's own
 * native-language translation underneath, so a learner who shares no language
 * with the tutor can still read what it means.
 */
export interface LessonSlide {
  /** target */
  phrase: string;
  /** learner's native language */
  translation: string;
  /** A short picture cue the tutor can draw or act out (instruction language). */
  cue: string;
}

export interface LessonPlan {
  unit: { id: number; title: string; cefrLevel: string } | null;
  /** In the instruction language. */
  objectives: string[];
  /** Notes for the tutor on explaining the new point, in the instruction language. */
  explanationNotes: string;
  phases: LessonPlanPhase[];
  rolePlay: string;
  fixSlot: LessonPlanFix[];
  homework: string;
  slides: LessonSlide[];
  fixShare: number;
}

export interface LessonPlanPromptInput {
  targetLanguageName: string;
  instructionLanguageName: string;
  learnerNativeLanguageName: string;
  cefrLevel: string | null;
  durationMinutes: number;
  timings: PhaseTiming[];
  unit: { title: string; description: string | null; canDo: string[] } | null;
  syllabusPhases: { title: string; objective: string | null }[];
  weakPoints: { category: string; pattern: string; example: string | null }[];
  lastLessonNotes: string | null;
  learnerNote: string | null;
}

export const MAX_SLIDES = 8;
export const LESSON_PLAN_MAX_TOKENS = 3500;

export function buildLessonPlanPrompt(input: LessonPlanPromptInput): string {
  const target = input.targetLanguageName;
  const instruction = input.instructionLanguageName;
  const native = input.learnerNativeLanguageName;
  const unit = input.unit
    ? `${input.unit.title}${input.unit.description ? ` — ${input.unit.description}` : ''}
Can-do statements this unit works towards:
${input.unit.canDo.map((c) => `- ${c}`).join('\n') || '- (none listed)'}
Syllabus content for this lesson:
${input.syllabusPhases.map((p) => `- ${p.title}: ${p.objective ?? ''}`).join('\n') || '- (none listed)'}`
    : '(No syllabus unit: plan a general conversation lesson at the learner\'s level.)';
  const weak = input.weakPoints.length > 0
    ? input.weakPoints.map((w) => `- [${w.category}] ${w.pattern}${w.example ? ` (e.g. "${w.example}")` : ''}`).join('\n')
    : '(none recorded yet: use the fix slot to consolidate the new point)';
  const timings = input.timings.map((t) => `- ${t.key} (${t.title}): ${t.minutes} min`).join('\n');

  return `You draft a ${input.durationMinutes}-minute one-to-one ${target} lesson plan for a human tutor. The learner is CEFR ${input.cefrLevel ?? 'level unknown (assume A1)'} and their native language is ${native}.

The tutor teaches ${target} THROUGH ${target}: simple, graded language, pictures and gestures, concept-check questions. Translation is never the main channel.

Next syllabus step:
${unit}

The learner's recurring weak points (for the personal fix slot):
${weak}
${input.lastLessonNotes ? `\nThe tutor's notes from the last lesson:\n${input.lastLessonNotes}\n` : ''}${input.learnerNote ? `\nThe learner wrote when booking: ${input.learnerNote}\n` : ''}
The lesson follows this template, with these fixed timings:
${timings}

Language rules, strictly:
- "objectives", "explanationNotes", "activities", "rolePlay", "exercise", "homework" and "cue" are notes FOR THE TUTOR, in ${instruction}.
- Every slide "phrase" is ${target} the learner will see and say.
- Every slide "translation" is that phrase in ${native}, for the learner.

Return JSON:
{
  "objectives": ["2 to 3 lesson objectives"],
  "explanationNotes": "how to present the new point in simple ${target}, with a concept-check question; 3 to 5 sentences",
  "phases": [ one per template phase, in order: {"key": "${TUTOR_PHASE_KEYS.join('" | "')}", "activities": ["2 to 4 concrete steps"]} ],
  "rolePlay": "the free-practice role-play: setting, roles and the learner's task",
  "fixSlot": [ one per weak point, at most 3: {"pattern": "the weak point label exactly as listed", "exercise": "a short targeted exercise"} ],
  "homework": "what the learner does before the next lesson",
  "slides": [ 4 to ${MAX_SLIDES} key phrases for the panel: {"phrase": "${target}", "translation": "${native}", "cue": "a picture or gesture cue"} ]
}`;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strings = (v: unknown, max: number, limit: number): string[] =>
  (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, limit);

/**
 * Validates the model's plan against the template. Phases come back in
 * template order with server-computed minutes whatever the model returned; a
 * plan with no usable phase activities throws so the caller can report it.
 */
export function parseLessonPlan(
  raw: string,
  context: {
    timings: PhaseTiming[];
    unit: LessonPlan['unit'];
    fixShare: number;
    weakPatterns: string[];
  },
): LessonPlan {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('lesson plan: not a JSON object');
  const obj = parsed as Record<string, unknown>;

  const byKey = new Map<string, string[]>();
  for (const item of Array.isArray(obj.phases) ? obj.phases : []) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.key === 'string') byKey.set(p.key, strings(p.activities, 400, 6));
  }

  const phases: LessonPlanPhase[] = context.timings.map((t) => ({
    key: t.key,
    title: t.title,
    minutes: t.minutes,
    activities: byKey.get(t.key) ?? [],
  }));
  if (phases.every((p) => p.activities.length === 0)) throw new Error('lesson plan: no phase activities');

  const allowed = new Set(context.weakPatterns.map((p) => p.toLowerCase()));
  const fixSlot: LessonPlanFix[] = [];
  for (const item of Array.isArray(obj.fixSlot) ? obj.fixSlot : []) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const pattern = str(f.pattern, 200);
    const exercise = str(f.exercise, 800);
    if (!exercise) continue;
    // A fix aimed at a pattern the learner does not have is invented work.
    if (allowed.size > 0 && !allowed.has(pattern.toLowerCase())) continue;
    fixSlot.push({ pattern, exercise });
    if (fixSlot.length >= 3) break;
  }

  const slides: LessonSlide[] = [];
  for (const item of Array.isArray(obj.slides) ? obj.slides : []) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const phrase = str(s.phrase, 200);
    if (!phrase) continue;
    slides.push({ phrase, translation: str(s.translation, 300), cue: str(s.cue, 200) });
    if (slides.length >= MAX_SLIDES) break;
  }

  return {
    unit: context.unit,
    objectives: strings(obj.objectives, 300, 4),
    explanationNotes: str(obj.explanationNotes, 2000),
    phases,
    rolePlay: str(obj.rolePlay, 1000),
    fixSlot,
    homework: str(obj.homework, 800),
    slides,
    fixShare: context.fixShare,
  };
}

/**
 * A tutor's edit, validated with the same bounds. The phase skeleton is
 * fixed: the tutor edits what happens in each phase, not the template.
 */
export function normalizeEditedPlan(raw: unknown, current: LessonPlan): LessonPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const edited = new Map<string, string[]>();
  for (const item of Array.isArray(obj.phases) ? obj.phases : []) {
    if (item && typeof item === 'object' && typeof (item as { key?: unknown }).key === 'string') {
      edited.set((item as { key: string }).key, strings((item as { activities?: unknown }).activities, 400, 8));
    }
  }
  const slides = (Array.isArray(obj.slides) ? obj.slides : current.slides)
    .map((s) => (s && typeof s === 'object' ? s as Record<string, unknown> : {}))
    .map((s) => ({ phrase: str(s.phrase, 200), translation: str(s.translation, 300), cue: str(s.cue, 200) }))
    .filter((s) => s.phrase)
    .slice(0, MAX_SLIDES);

  return {
    ...current,
    objectives: obj.objectives !== undefined ? strings(obj.objectives, 300, 6) : current.objectives,
    explanationNotes: obj.explanationNotes !== undefined ? str(obj.explanationNotes, 2000) : current.explanationNotes,
    phases: current.phases.map((p) => ({ ...p, activities: edited.get(p.key) ?? p.activities })),
    rolePlay: obj.rolePlay !== undefined ? str(obj.rolePlay, 1000) : current.rolePlay,
    homework: obj.homework !== undefined ? str(obj.homework, 800) : current.homework,
    slides,
  };
}

export function parseStoredPlan(stored: string): LessonPlan | null {
  try {
    const plan = JSON.parse(stored) as LessonPlan;
    return plan && Array.isArray(plan.phases) && Array.isArray(plan.slides) ? plan : null;
  } catch {
    return null;
  }
}
