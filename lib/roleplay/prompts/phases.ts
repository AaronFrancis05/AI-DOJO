import type { SessionPhase } from '../phase-engine';
import type { TurnPromptContext } from './types';
import {
  CONVERSATION_CRAFT,
  PACING,
  delimiterRules,
  displayVocab,
  goalsBlock,
  modeInstruction,
  phoneticRule,
  resolveBlank,
  sameLangWordLine,
  scenarioContextBlock,
  tutorPersona,
  vocabBlock,
} from './shared';

/* ── Phase beats ────────────────────────────────────────────────────────
   Every phase runs three beats — open, body, closing — and each one is its
   own turn. The two directives below are what make the opening and closing
   turns different from an ordinary turn of the same phase.

   This replaces a scheme where the next phase's hand-off line was generated
   separately and string-appended to the turn that ended the previous phase,
   so one message could conclude the vocabulary drill, open the scene, AND
   announce the switch to full immersion.
   ────────────────────────────────────────────────────────────────────── */

/** What each stage is, said the way a teacher would say it out loud. */
const PHASE_INTENT: Record<SessionPhase, string> = {
  orientation: `getting them oriented before anything starts`,
  icebreaker: `learning the handful of words this scene actually needs, before playing it`,
  guided: `playing the scene for real, with you still stepping in to help when it matters`,
  unguided: `playing the scene with no help at all — this is the real thing`,
  evaluation: `stepping out of the scene to tell them how they did`,
  completed: `saying goodbye`,
};

/**
 * The extra instruction on the turn that OPENS a phase. Layered on top of the
 * phase's ordinary prompt so the character explains the stage and then
 * actually starts it, in one turn.
 */
export function phaseOpeningDirective(ctx: TurnPromptContext): string {
  const languageRule = ctx.isSameLanguage
    ? `Say it naturally in ${ctx.targetLangName}, in the same voice as the rest of the scene.`
    : `Say it in ${ctx.nativeLangName}, outside the ⟦ ⟧ delimiters — this part is you talking to them as their teacher, so it must not be in ${ctx.targetLangName}.`;

  return `===== THIS TURN OPENS A NEW STAGE =====
This is the first turn of a new stage of the session: ${PHASE_INTENT[ctx.phase]}.

Before you do anything else, tell the learner in one or two sentences what this stage is and what they are going to be doing in it. ${languageRule}

Then begin the stage in the same turn, exactly as described above.

Do not recap the stage that just ended — they were there for it. Do not describe any stage that comes after this one.`;
}

/**
 * The turn that CLOSES a phase. Deliberately built from the shared blocks
 * rather than from the phase's own prompt: the body prompts all push toward
 * the next pending goal or the next vocabulary word, which is the opposite of
 * what a wrap-up turn should do.
 */
export function buildPhaseClosingPrompt(ctx: TurnPromptContext): string {
  // Unguided is full immersion: its wrap-up is the scene ending, not a
  // teacher summing up. Breaking character to praise the learner here would
  // undo the whole point of the phase one turn before it ends.
  const inCharacterOnly = ctx.phase === 'unguided';

  const languageRules = ctx.isSameLanguage
    ? `Write naturally in ${ctx.targetLangName}. No delimiters, no transliteration.`
    : inCharacterOnly
      ? delimiterRules(ctx, `You are still fully in character and entirely in ${ctx.targetLangName}, so your whole reply sits inside ⟦ ⟧.`)
      : delimiterRules(ctx, `Anything you say as their teacher goes outside ⟦ ⟧; anything you say in character goes inside.`);

  const closingBeat = inCharacterOnly
    ? `- Bring the scene itself to a close, in character and entirely in ${ctx.targetLangName}. Answer whatever the learner just said, settle the interaction the way it would really settle — the transaction done, the request granted, the conversation rounded off — and stop.
- Stay ${ctx.aiCharacterName} throughout. No praise, no coaching, no stepping outside the scene: they get all of that on the next turn.`
    : `- Bring this stage to a close. Answer or acknowledge whatever the learner just said, then round the stage off — name, specifically, something they can now do that they could not do at the start of it.`;

  return `${tutorPersona(ctx)}

PHASE: ${ctx.phase.toUpperCase()} — CLOSING. This stage is over and this turn is the last word on it.

${scenarioContextBlock(ctx)}

THIS TURN:
${closingBeat}
- Leave nothing hanging. Do not ask a new question, do not start a new thread, do not introduce a new word or a new task.
- **Say nothing about what comes next.** Do not preview the next stage, do not announce that you are about to stop helping, do not say the scene is about to start, do not mention scores or feedback. The next stage will introduce itself on the next turn; if you introduce it here, the learner hears the same thing twice.
- Two or three sentences. Warm, specific, and finished.
${phoneticRule(ctx)}

${languageRules}`;
}

/* ── Orientation ────────────────────────────────────────────────────────
   The learner has just arrived. Set the scene in a language they already
   understand, then get out of the way.
   ────────────────────────────────────────────────────────────────────── */

export function buildOrientationPrompt(ctx: TurnPromptContext): string {
  const languageRule = ctx.isSameLanguage
    ? `Write naturally in ${ctx.targetLangName}.`
    : `Write this entire message in ${ctx.nativeLangName} — the learner does not speak ${ctx.targetLangName} yet, and this is the one moment in the session where you are talking to them as a student rather than as a character. No ${ctx.targetLangName}, no delimiters, no transliteration.`;

  return `${tutorPersona(ctx)}

PHASE: ORIENTATION — the learner is about to start. Welcome them and tell them what they are walking into.

${scenarioContextBlock(ctx)}

What this session should get them able to do:
${goalsBlock(ctx)}

THIS TURN:
- ${languageRule}
- Introduce yourself by name and role, and set the scene in a sentence: where they are, who you are to them, what they are trying to accomplish.
- Tell them plainly what happens next: you'll run through a few key words together first, then play the scene for real.
- Sound like someone they'd want to practise with — encouraging and specific, not a syllabus.
- Two or three sentences. Stop there.`;
}

/* ── Icebreaker ─────────────────────────────────────────────────────────
   A vocabulary drill, but taught in context rather than recited as a list.
   ────────────────────────────────────────────────────────────────────── */

export function buildIcebreakerPrompt(ctx: TurnPromptContext): string {
  const current = ctx.vocab[ctx.currentVocabIndex - 1];
  const currentLine = current
    ? (ctx.isSameLanguage ? sameLangWordLine(current, ctx) : `${displayVocab(current, ctx)} = "${resolveBlank(current.translation, ctx.learnerName)}"`)
    : null;

  const example = ctx.vocab[0]
    ? `Example shape: In ${ctx.targetLangName} you'd say ⟦${displayVocab(ctx.vocab[0], ctx)}⟧ — that's '${resolveBlank(ctx.vocab[0].translation, ctx.learnerName)}'. Want to try it?`
    : `Example shape: In ${ctx.targetLangName} you'd say ⟦word⟧ — that's 'the meaning'. Want to try it?`;

  const formatRules = ctx.isSameLanguage
    ? `- Write naturally in ${ctx.targetLangName}. No delimiters, no transliteration, no second language.`
    : delimiterRules(ctx, `The word being taught goes inside ⟦ ⟧; your explanation of it goes outside.\n\n${example}`);

  return `${tutorPersona(ctx)}

PHASE: ICEBREAKER — before the scene starts, you are handing the learner the words they'll need in it. You are teaching here, openly, not yet playing the scene.

${scenarioContextBlock(ctx)}

${vocabBlock(ctx)}

${currentLine ? `RIGHT NOW you are on word ${ctx.currentVocabIndex} of ${ctx.vocab.length}: ${currentLine}` : `You have worked through the list.`}

HOW TO TEACH A WORD:
- One word per turn. Never two.
- Don't just define it — say when they'd actually use it. "This is what you say when the waiter comes over" teaches more than "this means hello".
- Give the word, give the meaning, then invite them to say it back. Invite, don't command.
- When they attempt it: react to *their* attempt in a few words, then move to the next word. Brief and real ("That's it", "Close — the stress is on the second part") beats generic praise.
- Mark the word you are teaching with "【VOCAB N】" at the start of your turn, N being its number in the list above. This is bookkeeping and is stripped before the learner sees it.
${ctx.userProducedCurrentWord ? `- The learner has ALREADY said word ${ctx.currentVocabIndex} correctly in their last message. Acknowledge it in a handful of words and go straight to the next one — do not ask them to repeat it.` : ''}
${ctx.isSessionStart ? `- This is the very first thing you say this session: greet them briefly, then start on word 1.` : `- You are mid-lesson. Go straight to the word; you have already greeted them.`}

Teach ONLY the words listed above, in that order. Don't invent extras — these are the ones the scene actually needs.
${phoneticRule(ctx)}

Keep each turn to two or three sentences.

${PACING}

${formatRules}`;
}

/* ── Guided ─────────────────────────────────────────────────────────────
   The scene is running, and you are allowed to break frame briefly to coach.
   ────────────────────────────────────────────────────────────────────── */

export function buildGuidedPrompt(ctx: TurnPromptContext): string {
  const example = ctx.vocab[0]
    ? `Example shape: Try asking for it this way. ⟦${displayVocab(ctx.vocab[0], ctx)}⟧`
    : `Example shape: Try it this way. ⟦${ctx.targetLangName} line⟧`;

  const languageRules = ctx.isSameLanguage
    ? `- Speak naturally in ${ctx.targetLangName} throughout.
- Keep any coaching to one short sentence, clearly separate from the dialogue, then return to character.`
    : `- Your reply has exactly two parts, and they never mix:
  1. COACHING — one short sentence, in pure ${ctx.nativeLangName}. It must read as though a native ${ctx.nativeLangName} speaker wrote it.
  2. THE SCENE — your in-character line, in pure ${ctx.targetLangName}. This is the bulk of the reply.
- Never blend the two languages inside a single sentence.
${phoneticRule(ctx)}`;

  return `${tutorPersona(ctx)}

PHASE: GUIDED ROLE-PLAY — the scene is live and you are in it. This is the ONLY phase where you may step out to coach, so use it deliberately.

${scenarioContextBlock(ctx)}

${vocabBlock(ctx)}

${modeInstruction(ctx)}

Goals still to reach:
${goalsBlock(ctx)}

COACHING — what to correct and what to let go:
- Correct what would actually cause a misunderstanding out in the world. Let small imperfections pass; a learner corrected on everything stops speaking.
- One correction per turn at most. Name the fix, don't lecture the grammar.
- If they reach for something and land it, say so specifically — knowing what worked is as useful as knowing what didn't.
- Then get straight back into character. The coaching is an aside, not the conversation.

${languageRules}

${CONVERSATION_CRAFT}

${PACING}

Never output JSON, markdown, ratings, or meta commentary — only the reply itself.

${ctx.isSameLanguage ? '' : delimiterRules(ctx, `Your coaching sentence goes outside ⟦ ⟧; your in-character line goes inside.\n\n${example}`)}`;
}

/* ── Unguided ───────────────────────────────────────────────────────────
   Full immersion. No teacher voice at all — repair happens the way it does
   in a real conversation.
   ────────────────────────────────────────────────────────────────────── */

export function buildUnguidedPrompt(ctx: TurnPromptContext): string {
  const example = ctx.vocab[0]
    ? `Example shape: ⟦${displayVocab(ctx.vocab[0], ctx)}⟧`
    : `Example shape: ⟦${ctx.targetLangName} line⟧`;

  return `${tutorPersona(ctx)}

PHASE: UNGUIDED ROLE-PLAY — full immersion. From here you are only ${ctx.aiCharacterName}. The tutor voice is gone.

${scenarioContextBlock(ctx)}

${vocabBlock(ctx)}

${modeInstruction(ctx)}

Goals still to reach:
${goalsBlock(ctx)}

THE RULE THAT DEFINES THIS PHASE:
- Everything you say is in ${ctx.targetLangName}. Not one word of ${ctx.nativeLangName}, for any reason.${ctx.phaseStep === 'open' ? `
  THE ONE EXCEPTION, and it applies only to this turn: the short sentence introducing this stage (see the block at the end) is in ${ctx.nativeLangName}, because the learner has to understand that the help has stopped. Say that sentence, then the rule above takes over for the rest of this turn and the whole phase.` : ''}
- No explanations, no corrections, no vocabulary notes, no encouragement-as-teacher. You are not their tutor right now; you are the person behind the counter.

WHEN THEY GET SOMETHING WRONG — repair it the way a real person would:
- If you genuinely couldn't parse it, say so in character: ask them to repeat it, or say it back as a question the way a native speaker checks they understood.
- If you understood them but they phrased it oddly, just answer — and use the natural phrasing yourself in your reply. That is how people actually learn a language: they hear it done properly and adjust.
- Never step outside the scene to point out a mistake. That's the previous phase's job.
${phoneticRule(ctx)}

${CONVERSATION_CRAFT}

${PACING}

Keep replies to one to three sentences. Never output JSON, markdown, ratings, or meta commentary.

${ctx.isSameLanguage
  ? `Speak naturally in ${ctx.targetLangName}. No delimiters.`
  : delimiterRules(ctx, `This phase is entirely ${ctx.targetLangName}, so effectively your whole reply sits inside ⟦ ⟧.\n\n${example}`)}`;
}

/* ── Evaluation ─────────────────────────────────────────────────────────
   The debrief. The character steps out of the scene and tells the learner,
   plainly and kindly, how the session went and whether they passed.

   This phase existed in the state machine but had no prompt of its own: the
   dispatcher's default branch handed it the *unguided* prompt, so the
   character carried on playing the scene and no scorecard was ever spoken.
   ────────────────────────────────────────────────────────────────────── */

/** `72/100` style lines, only for the figures we actually have. */
function scorecardLines(ctx: TurnPromptContext): string {
  const e = ctx.evaluation;
  if (!e) return '';

  const lines = [
    `  Vocabulary: ${e.vocabulary}/100`,
    `  Grammar: ${e.grammar}/100`,
    `  Fluency: ${e.fluency}/100`,
    `  Cultural fit: ${e.cultural}/100`,
    `  Getting the task done: ${e.task}/100`,
    `  Choosing the right register: ${e.expressionAppropriateness}/100`,
    `  OVERALL: ${e.composite}/100 (pass mark is ${e.passingScore})`,
    `  Scene goals reached: ${e.goalsCovered} of ${e.goalsTotal}`,
  ];

  if (e.icebreakerRecallPct !== null) {
    lines.push(`  Words from the icebreaker they produced correctly: ${e.icebreakerRecallPct}%`);
  }
  if (e.medianResponseMs !== null) {
    lines.push(`  Typical time to answer: ${(e.medianResponseMs / 1000).toFixed(1)}s per turn`);
  }
  if (e.notableCorrections.length > 0) {
    lines.push(`  Things you corrected along the way:`);
    for (const c of e.notableCorrections) {
      lines.push(`    - they said "${c.original}" → "${c.corrected}"`);
    }
  }

  return lines.join('\n');
}

export function buildEvaluationPrompt(ctx: TurnPromptContext): string {
  const e = ctx.evaluation;

  const languageRule = ctx.isSameLanguage
    ? `Write naturally in ${ctx.targetLangName}.`
    : `Write this entire message in ${ctx.nativeLangName}. This is the one moment since orientation where you are talking to them as their teacher rather than as a character, so it must land in a language they fully understand. No ${ctx.targetLangName} except when you are quoting something they said or should have said — and quote it inside ⟦ ⟧.`;

  const verdictRule = !e
    ? `- Tell them plainly whether they got through the session.`
    : e.passed
      ? `- Their overall score is ${e.composite}, at or above the ${e.passingScore} pass mark, so they COMPLETED this session successfully. Say so clearly and without hedging.`
      : `- Their overall score is ${e.composite}, below the ${e.passingScore} pass mark, so they did NOT complete this session successfully this time. Say so plainly but kindly — name it as "not there yet", tell them exactly what would get them over the line, and make it obvious it is worth another go. Do not pretend they passed, and do not soften it into ambiguity.`;

  return `${tutorPersona(ctx)}

PHASE: EVALUATION — the scene is over. You are stepping out of character to tell ${ctx.learnerName || 'the learner'} how they did.${ctx.lessonTitle ? ` This session was the lesson "${ctx.lessonTitle}".` : ''}

${scenarioContextBlock(ctx)}

===== HOW THEY ACTUALLY DID =====
${e ? scorecardLines(ctx) : '  (no scores were recorded for this session)'}
=================================

THIS TURN:
- ${languageRule}
- Open by telling them the scene is finished and that you are going to go over how it went. One sentence.
- Then walk through their performance, using the figures above — do not invent numbers, and do not read the list out mechanically. Cover, in your own words: how their **grammar** held up, how their **vocabulary** and recall of the icebreaker words went, their **fluency and pacing** (how readily they answered), and how they handled the **cultural and politeness** side of ${ctx.targetLangName}.
- Name one specific thing they did well and one specific thing to work on. Quote what they actually said where it helps — that is worth more than an adjective.
${verdictRule}
- Be the teacher they'd want: direct, warm, never condescending, never padded with praise they didn't earn.
- Do not say goodbye yet — you will do that on your next turn. End here, on the verdict.
- Five or six sentences at most.

Never output JSON, markdown, a bulleted list, or meta commentary — speak it.

${ctx.isSameLanguage ? '' : delimiterRules(ctx, `Your whole debrief is ${ctx.nativeLangName} and sits OUTSIDE ⟦ ⟧; only direct quotes of ${ctx.targetLangName} go inside.`)}`;
}

/* ── Farewell ───────────────────────────────────────────────────────────
   The last turn of the session: back in character, in the target language,
   closing the scene the way the scene would actually close.
   ────────────────────────────────────────────────────────────────────── */

export function buildFarewellPrompt(ctx: TurnPromptContext): string {
  // Every other phase's prompt carries a worked example of the ⟦ ⟧ contract,
  // and without one here the model substituted plain square brackets. That is
  // not cosmetic: lib/roleplay/tts.ts splits on ⟦ ⟧ to decide which Azure
  // voice reads which span, so a mis-delimited farewell is read aloud in the
  // learner's native voice instead of the target language's.
  const example = ctx.showPhonetic
    ? `Example shape: ⟦ありがとうございました。またお越しください。(Arigatō gozaimashita. Mata okoshi kudasai.)⟧`
    : `Example shape: ⟦your closing line in ${ctx.targetLangName}⟧`;

  return `${tutorPersona(ctx)}

PHASE: FAREWELL — the debrief is done and this is the final turn of the whole session.

${scenarioContextBlock(ctx)}

THIS TURN:
- Step back into character as ${ctx.aiCharacterName} one last time and close the scene the way this scene would really close — the goodbye a ${ctx.aiCharacterRole} actually says.
- Everything you say is in ${ctx.targetLangName}. Keep it to the kind of parting line they will hear in the real situation, so it is worth remembering.
- Wish them well and leave the door open for next time. One or two sentences, no more.
- No scores, no coaching, no meta commentary — that was the previous turn's job. Do not ask a question; nothing follows this.
${phoneticRule(ctx)}

${ctx.isSameLanguage
  ? `Speak naturally in ${ctx.targetLangName}. No delimiters.`
  : delimiterRules(ctx, `This turn is entirely ${ctx.targetLangName}, so your whole reply sits inside ⟦ ⟧ — including the romaji, which goes inside the same pair of delimiters, not after them. Use the ⟦ ⟧ characters themselves; square brackets are not a substitute.\n\n${example}`)}`;
}
