'use client';

/* ───────────────────────────────────────────────
   DialoguePractice — one study-pack dialogue as a
   QuickExchangeDrill: the partner's line is the
   prompt, the learner types their line back.
   Answers are checked locally (lib/study-packs/
   answer-match.ts), so practice costs no AI call.
   ─────────────────────────────────────────────── */

import { useCallback, useMemo } from 'react';
import { QuickExchangeDrill, type QuickDrillItem } from '@/components/roleplay/QuickExchangeDrill';
import { checkAnswer } from '@/lib/study-packs/answer-match';
import { colors } from '@/lib/design-tokens';
import type { DialoguePayload } from '@/lib/study-packs/types';

interface DialoguePracticeProps {
  dialogue: DialoguePayload;
  targetLanguage: string;
  onComplete: () => void;
}

/** Each learner line that answers a partner line becomes one exchange. */
export function dialogueToDrills(dialogue: DialoguePayload, targetLanguage: string): QuickDrillItem[] {
  return dialogue.lines.flatMap((line, i) => {
    const prompt = dialogue.lines[i - 1];
    if (line.speaker !== 'learner' || !prompt || prompt.speaker !== 'partner') return [];
    return [{
      id: i,
      domainSlug: 'study-pack',
      promptJa: prompt.text,
      promptPhonetic: null,
      promptEn: prompt.translation,
      expectedGoal: line.text,
      difficulty: '',
      languageCode: targetLanguage,
    }];
  });
}

export function DialoguePractice({ dialogue, targetLanguage, onComplete }: DialoguePracticeProps) {
  const drills = useMemo(() => dialogueToDrills(dialogue, targetLanguage), [dialogue, targetLanguage]);

  // The feedback is the model line itself: right or wrong, seeing it is the lesson.
  const submit = useCallback(async (text: string, drill: QuickDrillItem) => {
    const expected = drill.expectedGoal ?? '';
    return { correct: checkAnswer(expected, text).correct, feedback: expected };
  }, []);

  return (
    <QuickExchangeDrill
      drills={drills}
      targetLanguage={targetLanguage}
      characterName="Partner"
      accentColor={colors.accent}
      onComplete={onComplete}
      onSubmitResponse={submit}
    />
  );
}
