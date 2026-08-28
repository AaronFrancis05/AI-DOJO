/**
 * Scoring a finished interview.
 *
 * This half of the feature DOES go through `lib/ai-providers/` — it is an
 * ordinary text-in/JSON-out call, so it gets the circuit breaker and the
 * ordered failover like every other scoring call in the app. Only the Live
 * socket is exempt (see ./config.ts).
 *
 * Scores are clamped through `normalizeScores`, the same guard the roleplay
 * pipeline uses, so a malformed or out-of-range model response cannot reach
 * the score columns.
 */

import { getAIProvider, type ChatTurn } from '@/lib/ai-providers';
import { normalizeScores, type TurnScores } from '@/lib/ai-engine';
import { buildGradingInstruction, type GradingPromptInput } from './prompt';
import { transcriptToText, type InterviewTurn } from './transcript';

export interface InterviewGrade {
  scores: TurnScores;
  /** Addressed to the learner, in their native language. */
  feedback: string;
  /** One line for the tutor. */
  summary: string;
}

export interface GradeInterviewInput extends GradingPromptInput {
  turns: InterviewTurn[];
}

/**
 * A model may still wrap JSON in a fence despite being told not to. The
 * provider layer's JSON mode makes this rare rather than impossible, and a
 * fence is not a reason to lose a learner's whole examination.
 */
function parseGradeJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in grading response');
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

export async function gradeInterview(input: GradeInterviewInput): Promise<InterviewGrade> {
  const { turns, ...promptInput } = input;

  const systemInstruction = buildGradingInstruction(promptInput);

  // The transcript is delivered as one user turn rather than replayed as
  // conversation history: the model is marking a document, not continuing a
  // dialogue, and a replayed history invites it to answer the examiner's last
  // question instead of scoring it.
  const history: ChatTurn[] = [
    {
      role: 'user',
      content: `Here is the full transcript of the examination. Mark it.\n\n<transcript>\n${transcriptToText(
        turns,
        { examiner: promptInput.examinerName, learner: promptInput.learnerName },
      )}\n</transcript>`,
    },
  ];

  const provider = await getAIProvider();
  const rawText = await provider.generateJSON(systemInstruction, history);
  const parsed = parseGradeJson(rawText);

  return {
    scores: normalizeScores(parsed.scores),
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback.slice(0, 4000) : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '',
  };
}
