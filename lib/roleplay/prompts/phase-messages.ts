import type { AIProvider } from '../../ai-providers';
import { getTargetLangConfig, getNativeLangName } from '../../language';

export type PhaseMessageKind =
  | 'to-icebreaker'
  | 'to-guided'
  | 'to-unguided'
  | 'to-evaluation'
  | 'celebration';

/**
 * What the character should convey at each hand-off. Phrased as the moment
 * rather than the mechanic — "you're about to stop helping" produces a more
 * natural line than "transition to the unguided phase".
 */
const PHASE_MESSAGE_INTENT: Record<PhaseMessageKind, string> = {
  'to-icebreaker': `you're about to run through the key words together before the scene starts`,
  'to-guided': `the words are done and the scene is about to start for real, with you still helping`,
  'to-unguided': `from here you stop helping and stay fully in character — this is the real thing`,
  'to-evaluation': `the scene is wrapping up and you're about to tell them how they did`,
  celebration: `they just got all the way through the scenario, and you're genuinely pleased`,
};

/**
 * Generates the short hand-off line the character says between phases, in the
 * learner's actual languages.
 *
 * An earlier version appended hardcoded Japanese to every session regardless
 * of the course language, leaking Japanese into French, German, etc. lessons.
 * Returns '' on any failure so callers skip the message rather than emit
 * wrong-language text.
 */
export async function generateLocalizedPhaseMessage(
  provider: AIProvider,
  targetLanguage: string,
  nativeLanguage: string,
  charName: string,
  kind: PhaseMessageKind,
): Promise<string> {
  const targetLangName = getTargetLangConfig(targetLanguage).name;
  const nativeLangName = getNativeLangName(nativeLanguage);
  const isSameLanguage = targetLanguage === nativeLanguage;
  const showPhonetic = getTargetLangConfig(targetLanguage).hasPhonetic && targetLanguage === 'ja';
  const intent = PHASE_MESSAGE_INTENT[kind];

  const instruction = isSameLanguage
    ? `You are ${charName}. Say one short, natural line to the learner: ${intent}. Stay in character. No delimiters, no transliteration, no translation, no meta commentary — just the line.`
    : `You are ${charName}. Tell the learner, in two parts, that ${intent}.
1. One short sentence in ${nativeLangName}, outside any delimiters.
2. One short in-character sentence in ${targetLangName}, wrapped in ⟦ ⟧${showPhonetic ? ' with romaji in parentheses inside the delimiters' : ''}.
Everything outside ⟦ ⟧ must be pure ${nativeLangName}; everything inside must be pure ${targetLangName}. Keep the whole thing to 1-2 sentences.`;

  try {
    let text = '';
    for await (const chunk of provider.generateStream(instruction, [])) {
      text += chunk;
    }
    return text.trim();
  } catch (err) {
    console.warn(
      '[PHASE MESSAGE] generation failed, skipping:',
      err instanceof Error ? err.message : String(err),
    );
    return '';
  }
}
