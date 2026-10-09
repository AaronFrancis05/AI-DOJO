/**
 * Configuration for personalized learning (PLAN.md Phase 3): study packs,
 * the weak-point model and learner-owned scenarios.
 *
 * `STUDY_PACKS_ENABLED` gates every surface, the same way TUTORS_ENABLED gates
 * live tutoring (lib/tutors/config.ts). It must be read as the full literal
 * so Next.js inlines it into the browser bundle. With the flag off, sessions
 * complete exactly as before: no event is sent and no AI cost is incurred.
 */
export const STUDY_PACKS_ENABLED = process.env.NEXT_PUBLIC_STUDY_PACKS_ENABLED === '1';

/** Completed sessions without a pattern before that weak point counts as resolved. */
export const WEAK_POINT_RESOLVE_AFTER = 3;

/** How many open weak points a pack targets. */
export const PACK_FOCUS_COUNT = 3;

export const PACK_DRILL_COUNT = 5;
export const PACK_DIALOGUE_COUNT = 3;

/** Days after the session that the homework reminder is due. */
export const PACK_DUE_AFTER_DAYS = 1;

/** Output caps for the batch calls (lib/ai-providers GenerateOptions.maxTokens). */
export const CLASSIFY_MAX_TOKENS = 1500;
export const PACK_MAX_TOKENS = 4000;
export const SCENARIO_MAX_TOKENS = 4000;
