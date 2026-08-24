import type { PromptVocab, TurnPromptContext } from './types';

/**
 * Single source of truth for the learner-identity + placeholder-guard
 * instruction block. Every prompt that generates or evaluates a reply the
 * learner will read must include this — duplicating it inline per call site
 * is how the "[Your Name]"-style placeholder bug slipped past one prompt
 * (lib/ai-engine.ts) while still shipping live in another (the streaming
 * prompt in app/api/chat/stream/route.ts).
 *
 * Lives here rather than in ai-engine so the prompt modules own their own
 * building blocks and don't import back out of the prompts directory.
 */
export function buildIdentityAndGuardBlock(learnerName?: string, learnerCountry?: string | null): string {
  return learnerName
    ? `- The REAL learner you are talking to is named "${learnerName}"${learnerCountry ? ` and they are from ${learnerCountry}` : ''}. Use this real information whenever the roleplay calls for the learner's name or country — never invent a placeholder, never leave a blank unfilled, and never ask for information you already have here.

===== PLACEHOLDER GUARD =====
NEVER output an unresolved template artifact as visible text — no "___", no bracketed placeholders like "[Name]" or "[Country]", no unfilled blanks of any kind. If you need information about the learner that isn't provided above, ask for it naturally in-character before using it in a sentence — never guess or emit a placeholder token.`
    : `- The real learner's profile name/country were not provided. If the roleplay requires their name or country, ask for it naturally in-character before using it — never guess and never emit a placeholder token.

===== PLACEHOLDER GUARD =====
NEVER output an unresolved template artifact as visible text — no "___", no bracketed placeholders like "[Name]" or "[Country]", no unfilled blanks of any kind. If you need information about the learner that isn't provided above, ask for it naturally in-character before using it in a sentence — never guess or emit a placeholder token.`;
}

/**
 * Legacy seed content teaches fill-in-the-blank templates ("わたしは___です").
 * Substituting the learner's real name keeps an unresolved blank from ever
 * reaching the model — or the learner — as a visible artifact.
 */
export function resolveBlank(text: string, learnerName: string): string {
  return learnerName ? text.replace(/___/g, learnerName) : text;
}

/** `"word" (phonetic)` — the phonetic half only when it can be trusted. */
export function displayVocab(v: PromptVocab, ctx: TurnPromptContext): string {
  const phonetic = ctx.showPhonetic && v.phonetic
    ? ` (${resolveBlank(v.phonetic, ctx.learnerName)})`
    : '';
  return `"${resolveBlank(v.targetText, ctx.learnerName)}"${phonetic}`;
}

/**
 * One vocabulary line for a same-language lesson, where the phrase itself
 * lives in `targetText` and `translation` holds a description of it.
 *
 * An 'en' course with no curated localizations copies the translation into
 * targetText, so guard against printing the identical string twice.
 */
export function sameLangWordLine(v: PromptVocab, ctx: TurnPromptContext): string {
  const phrase = resolveBlank(String(v.targetText || '').trim(), ctx.learnerName);
  const meaning = resolveBlank(String(v.translation || '').trim(), ctx.learnerName);
  const distinct = phrase && meaning && phrase.toLowerCase() !== meaning.toLowerCase();
  const core = distinct ? `"${phrase}" — ${meaning}` : (phrase || meaning);
  const tip = v.usageTip ? resolveBlank(v.usageTip, ctx.learnerName) : null;
  return tip ? `${core} — ${tip}` : core;
}

export function vocabBlock(ctx: TurnPromptContext): string {
  if (ctx.vocab.length === 0) return '';
  const lines = ctx.isSameLanguage
    ? ctx.vocab.map((v, i) => `  ${i + 1}. ${sameLangWordLine(v, ctx)}`)
    : ctx.vocab.map((v, i) =>
        `  ${i + 1}. ${displayVocab(v, ctx)} = "${resolveBlank(v.translation, ctx.learnerName)}"`);
  return `Vocabulary for this lesson (in teaching order):\n${lines.join('\n')}`;
}

export function goalsBlock(ctx: TurnPromptContext): string {
  return ctx.goals.map((g) => {
    const status = ctx.completedSequenceOrders.includes(g.sequenceOrder) ? '[COVERED]' : '[PENDING]';
    return `  ${status} Goal ${g.sequenceOrder} (${g.goalType}): ${resolveBlank(g.goalText, ctx.learnerName)}`;
  }).join('\n');
}

export function modeInstruction(ctx: TurnPromptContext): string {
  return ctx.behaviorMode === 'trouble'
    ? `This customer/counterpart is hard work today: a little impatient, not especially accommodating, and willing to misunderstand a vague request rather than guessing charitably. Stay believable, never cruel — the point is to make the learner work for it, not to punish them.`
    : `You are warm, patient, and cooperative — the kind of person who makes a nervous speaker feel capable.`;
}

/**
 * Who the character is and where the scene takes place. Shared by every phase
 * so the setting can never drift between them.
 */
export function scenarioContextBlock(ctx: TurnPromptContext): string {
  return `===== THE SCENE =====
Setting: ${ctx.scenarioTitle} — ${ctx.situationContext}
You are playing: ${ctx.aiCharacterName}, ${ctx.aiCharacterRole}
What the learner is here to practise: ${ctx.situationLearningGoals}
=====================

${buildIdentityAndGuardBlock(ctx.learnerName, ctx.learnerCountry)}`;
}

/**
 * The ⟦ ⟧ output contract for cross-language lessons.
 *
 * This is load-bearing well beyond formatting: lib/roleplay/tts.ts splits on
 * these delimiters to decide which Azure voice speaks which span, so a reply
 * that mixes languages inside one span is read aloud in the wrong accent.
 */
export function delimiterRules(ctx: TurnPromptContext, note: string): string {
  const phonetic = ctx.showPhonetic ? ' (plus its romaji in parentheses)' : '';
  return `===== OUTPUT FORMAT (MANDATORY) =====
Wrap every ${ctx.targetLangName} span${phonetic} in ⟦ ⟧ delimiters. Everything OUTSIDE ⟦ ⟧ must be pure ${ctx.nativeLangName}; everything INSIDE must be pure ${ctx.targetLangName}${phonetic}. Never put ${ctx.nativeLangName} inside ⟦ ⟧, and never leave ${ctx.targetLangName} outside it. ${note}`;
}

/**
 * Phonetic glosses are only reliable for Japanese. For every other target
 * language the model would invent an ad hoc, inconsistent transliteration.
 */
export function phoneticRule(ctx: TurnPromptContext): string {
  return ctx.showPhonetic
    ? `- Include romaji in parentheses after ${ctx.targetLangName} text.`
    : `- Do NOT invent a pronunciation transliteration for ${ctx.targetLangName}. None is provided for this language, so anything you produce would be unreliable. Write the text as-is.`;
}

/**
 * The persona every phase opens with.
 *
 * The previous prompts opened with "You are an advanced backend AI processor
 * engine handling a multi-turn language simulation game", which is a large
 * part of why replies read as generated output rather than teaching.
 */
export function tutorPersona(ctx: TurnPromptContext): string {
  return `You are an experienced ${ctx.targetLangName} tutor who teaches through role-play. Right now you are in character as ${ctx.aiCharacterName} (${ctx.aiCharacterRole}), running a scene for one learner.

Two things are true at once and you hold both: you are a real person inside this scene, and you are a teacher who wants this learner to leave able to handle this situation for real. When the two conflict, the teaching wins — but you get back into character immediately afterwards.

The learner is working at a ${ctx.difficulty} level. Pitch everything to that.`;
}

/**
 * Conversational habits that make the character feel like a person rather
 * than a turn-taking machine. Applied to every phase that plays the scene.
 */
export const CONVERSATION_CRAFT = `HOW YOU TALK:
- Say one thing per turn. Real people don't deliver paragraphs across a counter.
- React to what the learner actually said before moving on — acknowledge it, be surprised by it, be pleased by it. A reply that ignores their content reads as a script.
- Vary your openings. If your last few turns started the same way, start differently.
- Ask a question only when a real person would; not as a mechanical prompt for the next turn.
- Let the scene have texture — a detail about the place, the queue, the weather, the menu. Small specifics are what make a scene feel real.
- You are steering. The learner should never have to guess what is expected of them, but you steer through the scene, not by narrating the lesson plan.`;

/**
 * Pacing rules. Deliberately short: the code-side vocabulary index and retry
 * gate in app/api/chat/stream/route.ts are authoritative, so the prompt does
 * not need to police looping. The long list of NEVER-RE-TEACH / NO-LOOP /
 * DO-NOT-GREET-AGAIN rules that used to live here existed only because the
 * model was being handed a conversation history in which every one of its own
 * turns was an empty string, so it genuinely could not tell what it had
 * already said. That bug is fixed (see lib/roleplay/conversation-history.ts);
 * the scaffolding it required is no longer needed.
 */
export const PACING = `PACING:
- You can see the conversation so far. Don't repeat a greeting, a question, or an explanation you have already given.
- If the learner stumbles on something twice, that's enough. Give them the correct version, take the pressure off, and move the scene on.
- Every turn should leave the learner closer to the goals still marked [PENDING].`;
