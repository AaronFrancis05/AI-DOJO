/**
 * Checks a typed answer in the study-pack dialogue drill against the expected
 * line, locally. The drill is homework repetition of lines the learner has
 * just read, so a closeness check is enough, and it costs no AI call.
 *
 * Words are compared as a bag (F1 over tokens), so a small slip like a
 * missing article still passes while a different sentence does not. Text
 * without spaces (Japanese, Chinese, Thai) is compared character by character.
 */

const PASS_SCORE = 0.75;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function units(text: string): string[] {
  return text.includes(' ') ? text.split(' ') : [...text];
}

/** Token-level F1 between two normalized strings, 0..1. */
function overlap(expected: string[], given: string[]): number {
  if (expected.length === 0 || given.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const u of expected) remaining.set(u, (remaining.get(u) ?? 0) + 1);
  let common = 0;
  for (const u of given) {
    const n = remaining.get(u) ?? 0;
    if (n > 0) {
      common += 1;
      remaining.set(u, n - 1);
    }
  }
  if (common === 0) return 0;
  const precision = common / given.length;
  const recall = common / expected.length;
  return (2 * precision * recall) / (precision + recall);
}

export interface AnswerCheck {
  correct: boolean;
  score: number;
}

export function checkAnswer(expected: string, given: string): AnswerCheck {
  const e = normalize(expected);
  const g = normalize(given);
  if (!g) return { correct: false, score: 0 };
  if (e === g) return { correct: true, score: 1 };
  const score = overlap(units(e), units(g));
  return { correct: score >= PASS_SCORE, score };
}
