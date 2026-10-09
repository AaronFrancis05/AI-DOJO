/**
 * The study pack (PLAN.md 3.2): prompt and validation, as pure functions.
 *
 * One batch call turns a session's corrections and the learner's open weak
 * points into homework: an explanation in the native language, one rule per
 * targeted weak point, five corrected-sentence drills, three mini dialogues,
 * and a next scenario picked from a list the server supplies. The model never
 * invents a scenario id: anything not on the list is dropped.
 */

import { PACK_DIALOGUE_COUNT, PACK_DRILL_COUNT, PACK_FOCUS_COUNT } from './config';
import { normalizePattern, weakPointKey } from './weak-points';
import {
  WEAK_POINT_CATEGORIES,
  type DialogueLine,
  type DialoguePayload,
  type DrillPayload,
  type FocusPayload,
  type WeakPointCategory,
} from './types';

export interface PackFocusInput {
  category: string;
  pattern: string;
  example: string | null;
  count: number;
}

export interface PackScenarioCandidate {
  id: number;
  title: string;
  difficulty: string;
}

export interface StudyPackPromptInput {
  targetLanguageName: string;
  nativeLanguageName: string;
  difficulty: string;
  scenarioTitle: string;
  corrections: { originalText: string; correctedText: string; explanation: string }[];
  focus: PackFocusInput[];
  candidates: PackScenarioCandidate[];
  occupation: string | null;
  interests: string[];
}

export interface StudyPackDraft {
  explanation: string;
  focus: FocusPayload[];
  drills: DrillPayload[];
  dialogues: DialoguePayload[];
  nextScenario: { id: number; reason: string } | null;
}

export function buildStudyPackPrompt(input: StudyPackPromptInput): string {
  const target = input.targetLanguageName;
  const native = input.nativeLanguageName;
  const focus = input.focus
    .map((f) => `- [${f.category}] ${f.pattern} (seen ${f.count}x)${f.example ? `, e.g. ${f.example}` : ''}`)
    .join('\n');
  const corrections = input.corrections.length > 0
    ? input.corrections.map((c) => `- "${c.originalText}" -> "${c.correctedText}": ${c.explanation}`).join('\n')
    : '(no corrections this session)';
  const candidates = input.candidates.length > 0
    ? input.candidates.map((c) => `- id ${c.id}: ${c.title} (${c.difficulty})`).join('\n')
    : '(none)';
  const about = [
    input.occupation ? `works as: ${input.occupation}` : null,
    input.interests.length > 0 ? `interested in: ${input.interests.join(', ')}` : null,
  ].filter(Boolean).join('; ');

  return `You write personal homework for a ${input.difficulty} learner of ${target} whose native language is ${native}. They just finished a role-play session: "${input.scenarioTitle}".${about ? `\nAbout the learner: ${about}. Set dialogues in situations that fit them.` : ''}

Weak points to target (most important first):
${focus}

Corrections from this session:
${corrections}

Scenarios they could practise next:
${candidates}

Language rules, strictly:
- Everything the learner READS as an explanation is in ${native}: "explanation", "title", "rule", "note", "translation", "reason".
- Everything the learner SAYS or practises is in ${target}: "example", "incorrect", "corrected", "text".
- Match the ${input.difficulty} level: short, common words for beginners.

Return JSON:
{
  "explanation": "3 to 5 sentences in ${native}: what went well, the main thing to fix, and how this homework helps",
  "focus": [ one per weak point above, at most ${PACK_FOCUS_COUNT}:
    {"pattern": "the weak point label EXACTLY as listed above", "title": "its name in ${native}", "rule": "the rule in 2 to 3 sentences of ${native}", "example": "one correct ${target} sentence"} ],
  "drills": [ exactly ${PACK_DRILL_COUNT}, each a NEW sentence (not copied from the session) containing one of the weak points:
    {"pattern": "the weak point label it drills", "incorrect": "${target} sentence with the mistake", "corrected": "the corrected ${target} sentence", "note": "why, in one sentence of ${native}"} ],
  "dialogues": [ exactly ${PACK_DIALOGUE_COUNT}, each 4 to 6 lines alternating speakers and starting with "partner", where the learner's lines use the weak points correctly:
    {"title": "short title in ${native}", "lines": [{"speaker": "partner" or "learner", "text": "${target}", "translation": "${native}"}]} ],
  "nextScenario": {"id": <one id from the scenario list, or null if the list is empty>, "reason": "one sentence in ${native} on why this scenario practises the weak points"}
}`;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Validates the model's pack against what it was given. Malformed entries are
 * dropped rather than failing the pack; a pack with no drills and no
 * dialogues left is useless homework and throws, so the job retries.
 */
export function parseStudyPack(
  raw: string,
  context: { focus: PackFocusInput[]; candidateIds: number[] },
): StudyPackDraft {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('study pack: not a JSON object');
  const obj = parsed as Record<string, unknown>;

  const explanation = str(obj.explanation, 2000);
  if (!explanation) throw new Error('study pack: missing explanation');

  const focusByPattern = new Map(context.focus.map((f) => [normalizePattern(f.pattern), f]));

  const focusSeen = new Set<string>();
  const focus: FocusPayload[] = [];
  for (const item of asArray(obj.focus)) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const source = focusByPattern.get(normalizePattern(str(f.pattern, 200)));
    if (!source) continue;
    const category: WeakPointCategory = (WEAK_POINT_CATEGORIES as readonly string[]).includes(source.category)
      ? (source.category as WeakPointCategory)
      : 'grammar';
    const key = weakPointKey(category, normalizePattern(source.pattern));
    if (focusSeen.has(key)) continue;
    const title = str(f.title, 200);
    const rule = str(f.rule, 1000);
    if (!title || !rule) continue;
    focusSeen.add(key);
    focus.push({ category, pattern: normalizePattern(source.pattern), title, rule, example: str(f.example, 400) });
    if (focus.length >= PACK_FOCUS_COUNT) break;
  }

  const drills: DrillPayload[] = [];
  for (const item of asArray(obj.drills)) {
    if (!item || typeof item !== 'object') continue;
    const d = item as Record<string, unknown>;
    const incorrect = str(d.incorrect, 400);
    const corrected = str(d.corrected, 400);
    if (!incorrect || !corrected || incorrect === corrected) continue;
    drills.push({ incorrect, corrected, note: str(d.note, 500), pattern: normalizePattern(str(d.pattern, 200)) });
    if (drills.length >= PACK_DRILL_COUNT) break;
  }

  const dialogues: DialoguePayload[] = [];
  for (const item of asArray(obj.dialogues)) {
    if (!item || typeof item !== 'object') continue;
    const d = item as Record<string, unknown>;
    const lines: DialogueLine[] = [];
    for (const line of asArray(d.lines)) {
      if (!line || typeof line !== 'object') continue;
      const l = line as Record<string, unknown>;
      const text = str(l.text, 400);
      if (!text) continue;
      lines.push({
        speaker: l.speaker === 'learner' ? 'learner' : 'partner',
        text,
        translation: str(l.translation, 400),
      });
    }
    // A dialogue is only practice if the learner has a line after a prompt.
    const practisable = lines.some((l, i) => l.speaker === 'learner' && i > 0 && lines[i - 1].speaker === 'partner');
    if (lines.length < 2 || !practisable) continue;
    dialogues.push({ title: str(d.title, 200), lines: lines.slice(0, 8) });
    if (dialogues.length >= PACK_DIALOGUE_COUNT) break;
  }

  if (drills.length === 0 && dialogues.length === 0) {
    throw new Error('study pack: no usable drills or dialogues');
  }

  let nextScenario: StudyPackDraft['nextScenario'] = null;
  if (obj.nextScenario && typeof obj.nextScenario === 'object') {
    const n = obj.nextScenario as Record<string, unknown>;
    const id = Number(n.id);
    if (Number.isInteger(id) && context.candidateIds.includes(id)) {
      nextScenario = { id, reason: str(n.reason, 500) };
    }
  }

  return { explanation, focus, drills, dialogues, nextScenario };
}
