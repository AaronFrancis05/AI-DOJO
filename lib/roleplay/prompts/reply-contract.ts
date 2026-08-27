import type { SessionPhase } from '../phase-engine';

/**
 * Describes, to the ANALYZER, the format the reply it is grading was actually
 * produced in.
 *
 * This lives beside the generation prompts in this same directory on purpose.
 * The analyzer used to be told the AI "replied in a code-switching style
 * (primarily <native> with embedded <target> phrases)" — a format no phase has
 * ever produced. The generation prompts enforce ⟦ ⟧ span separation, and
 * unguided is 100% target language with no native text at all. Grading a reply
 * against a format it was never written in corrupted the corrections, the
 * messageTarget/messageNative split, and goalsAddressedThisTurn.
 *
 * Whenever a phase's output contract changes in ./phases.ts, the matching
 * branch here changes with it.
 */
export function describeReplyContract(
  phase: SessionPhase,
  isSameLanguage: boolean,
  targetLangName: string,
  nativeLangName: string,
): string {
  if (isSameLanguage) {
    return `- The AI character replied entirely in ${targetLangName}, as flowing prose with NO delimiters and no second language. Evaluate the learner's input in that context.
- messageNative should contain the learner's full utterance. messageTarget should contain the specific ${targetLangName} phrase(s) they were practising, or an empty string if none stand out.`;
  }

  const spanRule = `- The AI character's reply uses ⟦ ⟧ delimiters to separate languages: everything INSIDE ⟦ ⟧ is ${targetLangName}, everything OUTSIDE is ${nativeLangName}. Those delimiters are formatting, not something the learner said or is expected to type.`;

  switch (phase) {
    case 'orientation':
      return `- The AI character's reply was written entirely in ${nativeLangName} with no delimiters — it is a plain-language welcome that sets up the session, not roleplay dialogue.
- The learner is not expected to produce ${targetLangName} yet. Do NOT penalise them for replying only in ${nativeLangName}, and do NOT raise corrections about a language they have not been taught yet.
- messageNative should contain the learner's full utterance; messageTarget should be an empty string unless they volunteered ${targetLangName} unprompted.`;

    case 'icebreaker':
      return `${spanRule}
- This is a vocabulary drill: the AI introduced ONE ${targetLangName} word or phrase inside ⟦ ⟧ and invited the learner to say it back. The learner's job this turn is to reproduce that one item.
- Grade primarily on whether they produced the drilled item. A short or bare answer is correct behaviour here, not a fluency failure.
- messageTarget should contain the ${targetLangName} item they attempted; messageNative their full utterance.`;

    case 'guided':
      return `${spanRule}
- The reply has two parts: a short coaching sentence in ${nativeLangName} outside the delimiters, and in-character roleplay dialogue in ${targetLangName} inside them.
- The learner is expected to attempt ${targetLangName}, but mixing in ${nativeLangName} is normal at this stage and is not itself an error.
- messageTarget should contain the ${targetLangName} the learner produced (empty string if none); messageNative their full utterance.`;

    case 'unguided':
      // buildUnguidedPrompt still emits the ⟦ ⟧ contract for a cross-language
      // lesson (tts.ts splits on those delimiters to pick the voice), so the
      // analyzer has to be told they may be there — "no delimiters" made it
      // read them as text the learner was meant to have produced.
      return `${spanRule}
- The AI character replied ENTIRELY in ${targetLangName} — full immersion, in-character only, with no coaching and no ${nativeLangName} anywhere. In practice that means effectively the whole reply sits inside ⟦ ⟧.
- The learner is expected to reply in ${targetLangName}. Falling back to ${nativeLangName} IS meaningful here: set isEnglishWhenExpected true only if they abandoned the target language wholesale or refused to participate.
- messageTarget should contain the ${targetLangName} they produced; messageNative a ${nativeLangName} translation of their utterance for the transcript.`;

    case 'evaluation':
      // The debrief steps out of the scene entirely: it is native-language
      // prose about the learner's performance, not dialogue. Grading it as
      // roleplay produced corrections against a scene that had already ended.
      return `${spanRule}
- The scene is OVER. The AI character stepped out of it to debrief the learner on how the whole session went, writing in ${nativeLangName} outside the delimiters; any ${targetLangName} inside ⟦ ⟧ is a quote of something the learner said or should have said, not a new prompt to respond to.
- The learner is reacting to feedback, not performing a task. Do NOT raise corrections on this turn and do NOT mark goals as addressed — nothing they say here is part of the scene.
- Set scenarioComplete false; the phase engine, not this analysis, decides when the session ends.
- messageNative should contain the learner's full utterance; messageTarget any ${targetLangName} they produced, or an empty string.`;

    case 'completed':
      return `${spanRule}
- This was the character's closing farewell, entirely in ${targetLangName}, and the session is finished.
- Do NOT raise corrections and do NOT mark goals as addressed.
- messageNative should contain the learner's full utterance; messageTarget any ${targetLangName} they produced, or an empty string.`;

    default:
      return `${spanRule}
- messageNative should contain the learner's full utterance. messageTarget should contain only the ${targetLangName} phrase(s) they produced, or an empty string if none.`;
  }
}
