import { db } from '../../../../src/db';
import { withSessionLock } from '../../../../src/db-pool';
import { sessions, conversations, corrections, evaluations, goalCompletions, users, vocabularyEncounters, audioJobs } from '../../../../src/schema';
import { analyzeTurn, loadSessionTurnData } from '../../../../lib/roleplay/analyze-turn';
import { getAIProvider, AIProviderError, AIQuotaError, AIModelError } from '../../../../lib/ai-providers';
import { getTargetLangConfig, getNativeLangName, getBCP47 } from '../../../../lib/language';
import {
  nextPhase,
  computeCompositeScore,
  PRONUNCIATION_PASS_THRESHOLD,
  PASSING_SCORE_THRESHOLD,
  STALL_THRESHOLD,
  SAFETY_CAP_TURN,
  UNGUIDED_MISTAKE_PENALTY,
  UNGUIDED_ENGLISH_PENALTY,
} from '../../../../lib/roleplay/phase-engine';
import { eq, and, sql } from 'drizzle-orm';
import { getAuthUser } from '../../../../lib/auth/server';
import { validateDelimiters } from '../../../../lib/roleplay/lang-detect';
import { sanitizeStreamedChunk, createStreamTextSanitizer } from '../../../../lib/roleplay/stream-sanitizer';
import { inngest } from '../../../../lib/inngest/client';
import type { AIProvider } from '../../../../lib/ai-providers';

async function enqueueAudioJob(
  conversationId: number,
  sessionId: number,
  text: string,
  lang: string,
  phase: string,
  speaker: string,
  voiceGender?: string,
): Promise<number | null> {
  try {
    const [row] = await db.insert(audioJobs).values({
      conversationId,
      sessionId,
      text,
      lang,
      phase,
      speaker,
      voiceGender: voiceGender ?? null,
    }).returning({ id: audioJobs.id });
    return row?.id ?? null;
  } catch (err) {
    console.error('[AUDIO QUEUE] Failed to enqueue job:', err);
    return null;
  }
}

async function dispatchAudioJob(jobId: number | null, conversationId: number, sessionId: number): Promise<void> {
  if (jobId == null) return;
  try {
    await inngest.send({
      name: 'audio/enqueued',
      data: { jobId, conversationId, sessionId },
    });
  } catch (err) {
    console.error('[INNGEST] Failed to dispatch audio job', jobId, err);
  }
}

export const runtime = 'nodejs';

type PhaseMessageKind = 'to-icebreaker' | 'to-guided' | 'to-unguided' | 'to-evaluation' | 'celebration';

const PHASE_MESSAGE_DESCRIPTION: Record<PhaseMessageKind, string> = {
  'to-icebreaker': 'the lesson is moving from orientation into the icebreaker vocabulary drill',
  'to-guided': 'the lesson is about to move from the vocabulary-drill phase into the guided roleplay phase',
  'to-unguided': 'the lesson is about to move from the guided roleplay phase into full-immersion unguided practice',
  'to-evaluation': 'the lesson is about to end and move into the final evaluation',
  'celebration': 'the learner just mastered the whole scenario',
};

type IcebreakerPhraseKey = 'ack' | 'newWord' | 'means' | 'tryIt' | 'allDone';

/**
 * Fixed phrases for the deterministic forced-advance icebreaker message (see
 * shouldForceAdvanceVocab below), which bypasses the model entirely and so
 * can't rely on it to localize anything. Unlike the English example strings
 * used elsewhere in this file as LLM prompt scaffolding, this text is sent to
 * the learner directly, so it must already be in the right language. Best-
 * effort translations — the less common languages here would benefit from a
 * native-speaker review. Falls back to English for any code not listed.
 */
const ICEBREAKER_PHRASES: Record<string, Record<IcebreakerPhraseKey, string>> = {
  en: { ack: "Good job!", newWord: "New word:", means: "means", tryIt: "Can you say it?", allDone: "That's all our vocabulary for now — let's practice!" },
  ja: { ack: 'よくできました!', newWord: '新しい単語:', means: 'という意味です', tryIt: '言ってみましょう?', allDone: 'これで単語は全部です。練習してみましょう!' },
  fr: { ack: 'Bon travail !', newWord: 'Nouveau mot :', means: 'signifie', tryIt: 'Peux-tu le dire ?', allDone: "C'est tout notre vocabulaire pour l'instant — pratiquons !" },
  de: { ack: 'Gut gemacht!', newWord: 'Neues Wort:', means: 'bedeutet', tryIt: 'Kannst du es sagen?', allDone: 'Das war unser gesamter Wortschatz — üben wir jetzt!' },
  es: { ack: '¡Buen trabajo!', newWord: 'Nueva palabra:', means: 'significa', tryIt: '¿Puedes decirlo?', allDone: 'Eso es todo nuestro vocabulario por ahora — ¡practiquemos!' },
  ru: { ack: 'Отлично!', newWord: 'Новое слово:', means: 'значит', tryIt: 'Можешь сказать это?', allDone: 'Это все наши слова на сегодня — давай попрактикуемся!' },
  ar: { ack: 'أحسنت!', newWord: 'كلمة جديدة:', means: 'تعني', tryIt: 'هل يمكنك أن تقولها؟', allDone: 'هذه كل مفرداتنا الآن — لنتدرب!' },
  sw: { ack: 'Vizuri sana!', newWord: 'Neno jipya:', means: 'maana yake ni', tryIt: 'Unaweza kulisema?', allDone: 'Hayo ndiyo msamiati wetu wote kwa sasa — tufanye mazoezi!' },
  lg: { ack: 'Weebale!', newWord: 'Ekigambo ekiggya:', means: 'kitegeeza', tryIt: 'Osobola okukyogera?', allDone: 'Ago ge magezi gonna ge tulina kaakati — tutandike okwenyigira!' },
  pt: { ack: 'Muito bem!', newWord: 'Palavra nova:', means: 'significa', tryIt: 'Consegues dizê-la?', allDone: 'Isso é todo o nosso vocabulário por agora — vamos praticar!' },
  it: { ack: 'Ottimo lavoro!', newWord: 'Nuova parola:', means: 'significa', tryIt: 'Riesci a dirla?', allDone: 'Questo è tutto il nostro vocabolario per ora — mettiamolo in pratica!' },
  nl: { ack: 'Goed gedaan!', newWord: 'Nieuw woord:', means: 'betekent', tryIt: 'Kun je het zeggen?', allDone: 'Dat is al onze woordenschat voor nu — laten we oefenen!' },
  tr: { ack: 'Aferin!', newWord: 'Yeni kelime:', means: 'anlamına gelir', tryIt: 'Söyleyebilir misin?', allDone: 'Şimdilik kelime dağarcığımız bu kadar — hadi pratik yapalım!' },
  pl: { ack: 'Dobra robota!', newWord: 'Nowe słowo:', means: 'znaczy', tryIt: 'Potrafisz to powiedzieć?', allDone: 'To już całe nasze słownictwo na teraz — poćwiczmy!' },
  uk: { ack: 'Молодець!', newWord: 'Нове слово:', means: 'означає', tryIt: 'Можеш це сказати?', allDone: 'Це всі наші слова на зараз — давай практикуватися!' },
  el: { ack: 'Μπράβο!', newWord: 'Νέα λέξη:', means: 'σημαίνει', tryIt: 'Μπορείς να το πεις;', allDone: 'Αυτό είναι όλο το λεξιλόγιό μας προς το παρόν — ας εξασκηθούμε!' },
  he: { ack: 'כל הכבוד!', newWord: 'מילה חדשה:', means: 'פירושה', tryIt: 'אתה יכול להגיד את זה?', allDone: 'זה כל אוצר המילים שלנו לעת עתה — בואו נתרגל!' },
  fa: { ack: 'آفرین!', newWord: 'کلمه جدید:', means: 'به معنی', tryIt: 'می‌توانی آن را بگویی؟', allDone: 'این تمام واژگان ما برای الان است — بیایید تمرین کنیم!' },
  hi: { ack: 'शाबाश!', newWord: 'नया शब्द:', means: 'का अर्थ है', tryIt: 'क्या तुम इसे बोल सकते हो?', allDone: 'फ़िलहाल हमारी सारी शब्दावली यही है — चलो अभ्यास करते हैं!' },
  bn: { ack: 'চমৎকার!', newWord: 'নতুন শব্দ:', means: 'মানে', tryIt: 'তুমি কি এটা বলতে পারো?', allDone: 'আপাতত এটাই আমাদের সব শব্দভাণ্ডার — চলো অনুশীলন করি!' },
  ne: { ack: 'राम्रो काम!', newWord: 'नयाँ शब्द:', means: 'को अर्थ हो', tryIt: 'के तपाईं यो भन्न सक्नुहुन्छ?', allDone: 'अहिलेलाई हाम्रो सबै शब्दावली यही हो — अभ्यास गरौं!' },
  ur: { ack: 'شاباش!', newWord: 'نیا لفظ:', means: 'کا مطلب ہے', tryIt: 'کیا آپ یہ کہہ سکتے ہیں؟', allDone: 'فی الحال ہماری تمام الفاظ کی فہرست یہی ہے — آئیے مشق کریں!' },
  zh: { ack: '做得好!', newWord: '新单词:', means: '意思是', tryIt: '你能说说看吗?', allDone: '这就是我们目前的全部词汇——我们来练习吧!' },
  ko: { ack: '잘했어요!', newWord: '새 단어:', means: '라는 뜻이에요', tryIt: '말해볼 수 있어요?', allDone: '지금까지 배운 단어는 여기까지예요 — 연습해봐요!' },
  th: { ack: 'เก่งมาก!', newWord: 'คำศัพท์ใหม่:', means: 'แปลว่า', tryIt: 'พูดได้ไหม?', allDone: 'นี่คือคำศัพท์ทั้งหมดของเราตอนนี้ — มาฝึกกันเถอะ!' },
  vi: { ack: 'Làm tốt lắm!', newWord: 'Từ mới:', means: 'có nghĩa là', tryIt: 'Bạn có thể nói được không?', allDone: 'Đó là tất cả từ vựng của chúng ta lúc này — hãy cùng luyện tập!' },
  tl: { ack: 'Mahusay!', newWord: 'Bagong salita:', means: 'ibig sabihin ay', tryIt: 'Kaya mo bang sabihin ito?', allDone: 'Iyan na ang lahat ng ating bokabularyo sa ngayon — mag-ensayo tayo!' },
  ms: { ack: 'Bagus!', newWord: 'Perkataan baharu:', means: 'bermaksud', tryIt: 'Bolehkah anda sebutkannya?', allDone: 'Itu sahaja kosa kata kita buat masa ini — mari kita berlatih!' },
  id: { ack: 'Bagus sekali!', newWord: 'Kata baru:', means: 'artinya', tryIt: 'Bisakah kamu mengucapkannya?', allDone: 'Itu semua kosakata kita untuk saat ini — ayo kita berlatih!' },
  km: { ack: 'ល្អណាស់!', newWord: 'ពាក្យថ្មី:', means: 'មានន័យថា', tryIt: 'តើអ្នកអាចនិយាយវាបានទេ?', allDone: 'នេះជាវាក្យសព្ទទាំងអស់របស់យើងសម្រាប់ពេលនេះ — តោះអនុវត្ត!' },
  my: { ack: 'ကောင်းပါတယ်!', newWord: 'စကားလုံးအသစ်:', means: 'ဆိုလိုသည်မှာ', tryIt: 'ပြောပြနိုင်မလား?', allDone: 'အခုအတွက်တော့ ဒါဟာ ကျွန်တော်တို့ရဲ့ ဝေါဟာရအားလုံးပဲ — လေ့ကျင့်ကြရအောင်!' },
  lo: { ack: 'ດີຫຼາຍ!', newWord: 'ຄໍາໃໝ່:', means: 'ໝາຍຄວາມວ່າ', tryIt: 'ເຈົ້າເວົ້າໄດ້ບໍ?', allDone: 'ນັ້ນແມ່ນຄໍາສັບທັງໝົດຂອງພວກເຮົາໃນຕອນນີ້ — ມາຝຶກກັນເທາະ!' },
};

function icebreakerPhrase(langCode: string, key: IcebreakerPhraseKey): string {
  return (ICEBREAKER_PHRASES[langCode] ?? ICEBREAKER_PHRASES.en)[key];
}

/**
 * Languages whose writing system does not separate words with spaces (CJK,
 * Thai, Khmer, Burmese, Lao). For these there is no word boundary to enforce,
 * so phrase matching falls back to raw substring containment.
 */
const SPACE_DELIMITED_LANGUAGES = new Set([
  'en', 'fr', 'de', 'es', 'ru', 'ar', 'sw', 'lg', 'pt', 'it', 'nl', 'tr', 'pl',
  'uk', 'el', 'he', 'fa', 'hi', 'bn', 'ur', 'ko', 'vi', 'tl', 'ms', 'id',
]);

/**
 * Lightweight lexical check for whether the learner's raw input contains the
 * word currently being drilled (its target text, romaji phonetic, or meaning).
 * Used to steer the model past a word the learner has already produced, so the
 * AI doesn't loop back and ask them to repeat it.
 *
 * Matching rules:
 * - Exact match always counts.
 * - For space-delimited languages, a phrase match must appear as a standalone
 *   token, so a partial input like "bon" never matches "bonjour" (and the user
 *   typing "bonjour" never counts as producing the word "bon").
 * - Non-space-delimited scripts fall back to substring containment; reverse
 *   containment is never used.
 */
function userAttemptsVocabWord(
  input: string,
  v: { targetText: string; phonetic: string | null; translation: string },
  targetLanguage: string,
): boolean {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[.,!?;:'"()\[\]⟦⟧【】]/g, '');
  const clean = norm(input);
  if (!clean) return false;
  const haystacks = [v.targetText, v.phonetic ?? '', v.translation].map(norm).filter(Boolean);

  if (!SPACE_DELIMITED_LANGUAGES.has(targetLanguage)) {
    return haystacks.some(h => clean === h || clean.includes(h));
  }

  return haystacks.some(h => {
    if (clean === h) return true;
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(clean);
  });
}

/**
 * Generates the short phase-transition / celebration message in the learner's
 * actual target language. The old version appended hardcoded Japanese phrases
 * to every session regardless of the course language — that leaked Japanese
 * into French, German, etc. lessons. Returns '' on any failure so callers can
 * skip the message rather than emit wrong-language text.
 */
async function generateLocalizedPhaseMessage(
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
  const description = PHASE_MESSAGE_DESCRIPTION[kind];

  const instruction = isSameLanguage
    ? `You are ${charName}. ${description}. Write ONE short, natural sentence in ${targetLangName} (no delimiters, no romaji, no translations, no explanations).`
    : `You are ${charName}. ${description}. Write a brief message with two parts:
1. An explanation line in ${nativeLangName}.
2. One short sentence in ${targetLangName} wrapped in ⟦ ⟧ delimiters${showPhonetic ? ' with romaji in parentheses inside the delimiters' : ''}.
Everything outside ⟦ ⟧ must be pure ${nativeLangName}; everything inside ⟦ ⟧ must be pure ${targetLangName}. Keep the whole message to 1-2 sentences.`;

  try {
    let text = '';
    for await (const chunk of provider.generateStream(instruction, [])) {
      text += chunk;
    }
    return text.trim();
  } catch (err) {
    console.warn(
      '[STREAM CHAT] phase message generation failed, skipping:',
      err instanceof Error ? err.message : String(err),
    );
    return '';
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawSessionId = body.sessionId;
    const rawUserInput = body.userRawInput;
    const isRetryOfPreviousMistake = body.isRetryOfPreviousMistake === true;
    const accuracyScore = typeof body.accuracyScore === 'number' ? body.accuracyScore : null;
    const responseTimeMs = typeof body.responseTimeMs === 'number' ? body.responseTimeMs : null;

    if (!rawSessionId || !rawUserInput) {
      return Response.json({ error: 'sessionId and userRawInput are required' }, { status: 400 });
    }

    const sessionId = String(rawSessionId);
    const userRawInput = String(rawUserInput);
    const numericSessionId = Number(sessionId);
    if (isNaN(numericSessionId)) {
      return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, numericSessionId));
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.userId !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.status === 'completed') {
      return Response.json({ error: 'Session is already completed' }, { status: 400 });
    }

    const turnData = await loadSessionTurnData(session);
    const currentScenario = turnData.scenario;
    const situationResult = turnData.situation;
    const goals = turnData.goals;
    const completedSequenceOrders = turnData.completedSequenceOrders;
    const conversationHistory = turnData.conversationHistory;
    const currentTurnNo = turnData.currentTurnNo;
    const vocabRows = turnData.vocabRows;
    const behaviorMode = turnData.behaviorMode;
    const targetLanguage = turnData.targetLanguage;
    const nativeLanguage = turnData.nativeLanguage;
    const isSameLanguage = turnData.isSameLanguage;
    const currentPhase = turnData.currentPhase;

    if (!currentScenario) {
      return Response.json({ error: 'Scenario not found' }, { status: 404 });
    }

    let situationContext = currentScenario.context;
    let situationLearningGoals = currentScenario.learningGoals;
    if (situationResult && !turnData.scenarioLocalized) {
      situationContext = situationResult.context;
      situationLearningGoals = situationResult.learningGoals;
    }

    const targetLangName = getTargetLangConfig(targetLanguage).name;
    const nativeLangName = getNativeLangName(nativeLanguage);

    const isSessionStart = userRawInput === '__session_start__';
    const effectiveInput = isSessionStart ? '' : userRawInput;

    // ── Icebreaker vocab-word tracking (code-enforced, not prompt-only) ──
    // icebreakerVocabIndex is the 1-based word currently being taught;
    // icebreakerVocabAttempts counts how many teaching turns have been spent
    // on it. Both are authoritative — the AI's "【VOCAB N】" marker only
    // updates them after being parsed back out of its own response below.
    const hasNoVocab = vocabRows.length === 0;
    const isOrientation = currentPhase === 'orientation';
    const currentVocabIndex = session.icebreakerVocabIndex ?? 1;
    const currentVocabAttempts = session.icebreakerVocabAttempts ?? 0;
    const isIcebreakerExhausted = currentPhase === 'icebreaker'
      && !isSessionStart
      && currentVocabIndex > vocabRows.length;

    // The learner gets exactly one retry per word (two teaching turns total).
    // Once that ceiling is hit, don't give the model another chance to loop —
    // deterministically advance to the next word ourselves.
    const shouldForceAdvanceVocab = currentPhase === 'icebreaker'
      && !isSessionStart
      && !isIcebreakerExhausted
      && !hasNoVocab
      && currentVocabAttempts >= 2;
    const forcedNextVocabRow = shouldForceAdvanceVocab ? vocabRows[currentVocabIndex] : undefined;

    // Deterministic signal for the icebreaker phase: did the learner's last
    // message already contain the word we are currently teaching? When true we
    // steer the model to move on, and (after analysis below) advance the index
    // ourselves instead of trusting a "【VOCAB N】" marker the model might re-emit
    // to loop back. For cross-language lessons only the target-language word /
    // romaji counts — repeating the native meaning is not "saying the word".
    const currentVocabRow = (currentPhase === 'icebreaker' && !isSessionStart && currentVocabIndex <= vocabRows.length)
      ? vocabRows[currentVocabIndex - 1]
      : undefined;
    const userProducedCurrentWord = !!currentVocabRow && userAttemptsVocabWord(
      effectiveInput,
      {
        targetText: currentVocabRow.targetText,
        phonetic: currentVocabRow.phonetic,
        translation: isSameLanguage ? currentVocabRow.translation : '',
      },
      targetLanguage,
    );

    // The base `phonetic` column stores Japanese romaji. Once vocab is
    // localized into a non-Japanese target language that romaji is wrong, so
    // only surface phonetics for genuinely Japanese-target lessons.
    const showPhonetic = getTargetLangConfig(targetLanguage).hasPhonetic && targetLanguage === 'ja';
    const displayVocab = (v: (typeof vocabRows)[number]) => {
      const phoneticPart = showPhonetic && v.phonetic ? ` (${v.phonetic})` : '';
      return `"${v.targetText}"${phoneticPart}`;
    };

    const vocabBlock = vocabRows.length > 0
      ? `Key vocabulary for this lesson:\n${
          isSameLanguage
            ? vocabRows.map((v, i) => `  ${i + 1}. "${v.translation}"${v.usageTip ? ` — ${v.usageTip}` : ''}`).join('\n')
            : vocabRows.map((v, i) => `  ${i + 1}. ${displayVocab(v)} = "${v.translation}"`).join('\n')
        }`
      : '';

    // Delimiter-format examples for the dual-language prompts. Built from the
    // actual (already-localized) lesson vocabulary so they demonstrate the
    // format in the real target language instead of hardcoded Japanese.
    const icebreakerExample = vocabRows[0]
      ? `Example: Let's learn a useful word. In ${targetLangName}, we say ⟦${displayVocab(vocabRows[0])}⟧ — it means '${vocabRows[0].translation}'. Can you say ⟦${displayVocab(vocabRows[0])}⟧?`
      : `Example: In ${targetLangName}, we say ⟦${targetLangName} word (romaji)⟧ — it means 'the meaning'. Can you say ⟦${targetLangName} word (romaji)⟧?`;

    // Deterministically hands off to the next word when we bypass generation
    // (see shouldForceAdvanceVocab below). This text goes straight to the
    // learner rather than through the model, so — unlike the English example
    // strings above, which are just LLM prompt scaffolding — it must already
    // be phrased in the right language: entirely in targetLanguage for a
    // same-language lesson, or native-language connectives around a
    // ⟦ ⟧-wrapped target-language word for a cross-language one.
    const forcedAdvanceLang = isSameLanguage ? targetLanguage : nativeLanguage;
    const buildWordIntro = (v: (typeof vocabRows)[number]) => isSameLanguage
      ? `${icebreakerPhrase(forcedAdvanceLang, 'newWord')} ${v.translation}${v.usageTip ? ` — ${v.usageTip}` : ''} ${icebreakerPhrase(forcedAdvanceLang, 'tryIt')}`
      : `${icebreakerPhrase(forcedAdvanceLang, 'newWord')} ⟦${displayVocab(v)}⟧ — ${icebreakerPhrase(forcedAdvanceLang, 'means')} "${v.translation}". ${icebreakerPhrase(forcedAdvanceLang, 'tryIt')} ⟦${displayVocab(v)}⟧`;
    const forcedAdvanceMessage = !shouldForceAdvanceVocab
      ? null
      : forcedNextVocabRow
        ? `${icebreakerPhrase(forcedAdvanceLang, 'ack')} 【VOCAB ${currentVocabIndex + 1}】 ${buildWordIntro(forcedNextVocabRow)}`
        // Already on the last word — no next word to hand off to. Emit a
        // one-past-the-end marker so the index-based icebreakerDone check
        // below still advances the phase instead of looping forever.
        : `${icebreakerPhrase(forcedAdvanceLang, 'ack')} 【VOCAB ${currentVocabIndex + 1}】 ${icebreakerPhrase(forcedAdvanceLang, 'allDone')}`;
    const guidedExample = vocabRows[0]
      ? `Example: The phrase ${displayVocab(vocabRows[0])} means '${vocabRows[0].translation}'. Now you try: ⟦${displayVocab(vocabRows[0])}⟧`
      : `Example: Now you try: ⟦${targetLangName} word (romaji)⟧`;
    const unguidedExample = vocabRows.length >= 2
      ? `Example: ⟦${displayVocab(vocabRows[0])}⟧ ⟦${displayVocab(vocabRows[1])}⟧？`
      : vocabRows[0]
        ? `Example: ⟦${displayVocab(vocabRows[0])}⟧`
        : `Example: ⟦${targetLangName} text (romaji)⟧ ⟦${targetLangName} text (romaji)⟧？`;

    const goalsBlock = goals.map(g => {
      const done = completedSequenceOrders.includes(g.sequenceOrder);
      const status = done ? '[COVERED]' : '[PENDING]';
      return `  ${status} Goal ${g.sequenceOrder} (${g.goalType}): ${g.goalText}`;
    }).join('\n');

    const modeInstruction = behaviorMode === 'trouble'
      ? `The AI character should be MORE DIFFICULT to deal with — less cooperative, more complex vocabulary, occasionally misunderstand the user.`
      : `The AI character should be cooperative, friendly, and helpful.`;

    const scenarioTitle = turnData.scenarioLocalized
      ? currentScenario.title
      : (situationResult?.title ?? currentScenario.title);
    const scenarioContextBlock = `
===== SCENARIO =====
Title: ${scenarioTitle}
Setting: ${situationContext}
Learning goals: ${situationLearningGoals}
=====================`;

    // ── Phase-specific prompts ──
    const orientationRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}).
PHASE: ORIENTATION — Welcome the learner warmly, introduce yourself, and plainly explain what this practice session is about.

${scenarioContextBlock}

Goals to cover in this session:
${goalsBlock}

RULES FOR ORIENTATION:
- PURE ${nativeLangName}: Write your entire response in friendly, natural ${nativeLangName}. Do NOT use delimiters, romaji, or foreign script.
- Introduce yourself by name (${currentScenario.aiCharacterName}) and role (${currentScenario.aiCharacterRole}).
- Plainly explain what the session is about (setting, scenario goal: "${scenarioTitle}", and what role the learner plays).
- Mention that you will first drill a few key vocabulary words together before moving into the live roleplay.
- Keep the message concise, clear, and encouraging (2–3 sentences max).`;

    const sameLangOrientationRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}).
PHASE: ORIENTATION — Welcome the learner warmly, introduce yourself, and plainly explain what this practice session is about.

${scenarioContextBlock}

Goals to cover in this session:
${goalsBlock}

RULES FOR ORIENTATION:
- Speak naturally in ${targetLangName}.
- Introduce yourself by name (${currentScenario.aiCharacterName}) and role (${currentScenario.aiCharacterRole}).
- Plainly explain what the session is about (setting, scenario goal: "${scenarioTitle}", and what role the learner plays).
- Mention that you will first drill a few key vocabulary words together before moving into the live roleplay.
- Keep the message concise, clear, and encouraging (2–3 sentences max).`;

    const icebreakerGreetingRule = isSessionStart
      ? `- This is the FIRST message of the session: begin by greeting the student in ${nativeLangName} and explaining what the scenario is about, using the title and setting above.`
      : `- Do NOT greet the student again — you already greeted them at the start of this session. Continue directly with teaching/practicing the current vocabulary word. Do not restate the scenario setting either; that was already covered.`;
    const icebreakerRules = `
ROLE: You are a LANGUAGE TEACHER, not just a roleplay character. Your primary job is TEACHING vocabulary through conversation.

PHASE: ICEBREAKER — You are introducing the student to key vocabulary for the upcoming roleplay scenario described below. Every word you teach must be directly relevant to this specific scenario.

${scenarioContextBlock}

${vocabBlock}

Rules for icebreaker phase:
- STRICT VOCAB LIMIT: You have EXACTLY ${vocabRows.length} vocabulary word(s) listed above. Teach ONLY these words and in this exact order. Do NOT create, invent, or add any words beyond this list. If the student says something unrelated, acknowledge it briefly and return to the current word.
- BREVITY: Keep your entire response to 2-3 sentences max. Do not give long explanations.
${icebreakerGreetingRule}
- For each word: say the ${targetLangName} word (with romaji in parentheses), then clearly say its ${nativeLangName} meaning.
- After introducing a word, ask the student to repeat it back to you.
- Keep your tone encouraging and supportive — the student is a beginner.
- Use a mix of ${nativeLangName} for explanations and ${targetLangName} (with romaji) for the vocabulary itself.
- Do NOT cover multiple words at once. One word per turn.
- After the student attempts a word, give very brief feedback (5 words max) in ${nativeLangName} on their attempt, then introduce the next word.
- Mark the vocabulary word you are currently teaching by saying "【VOCAB N】" at the start of your teaching turn, where N is the word number (1-based).
- If this is the session-start turn (see rule above), start teaching word 1 right after your one-time greeting. On every later turn, skip straight to introducing/reviewing the current word — no greeting.
- STRICT NO-LOOP RETRY RULE: If the learner has already attempted this word/phrase once and it is still not completely clean, do NOT ask them to repeat it a second time. Acknowledge their effort, provide the correct pronunciation/phrase for reference, and smoothly move to the next word. Never loop more than once on any item.
- NEVER RE-TEACH A MASTERED WORD: If the student's message already contains the current vocabulary word (they said it correctly), do NOT ask them to say it again. Give a very short acknowledgment and immediately introduce the next word.
- CRITICAL: Never teach vocabulary unrelated to this scenario. Stay on-topic. Use ONLY the listed scenario vocabulary.
- GOAL-DRIVEN PROGRESS: Every turn you must move the conversation forward — acknowledge, then teach the next word. Never stall on the same word. Aim to complete the lesson session naturally and on time.
- When appropriate, briefly signal what the student should expect next in the session (e.g. moving to a new goal or wrapping up), so the learner never feels like they have to guess what to do — you are always the one steering the conversation forward.

===== OUTPUT FORMAT (MANDATORY) =====
Wrap every ${targetLangName} span — the word/phrase itself plus its romaji in parentheses — in ⟦ ⟧ delimiters. Everything OUTSIDE ⟦ ⟧ must be pure ${nativeLangName}, and everything INSIDE ⟦ ⟧ must be ${targetLangName} (+ romaji). Never place ${nativeLangName} text inside ⟦ ⟧, and never place ${targetLangName} text outside it.

${icebreakerExample}`;

    const guidedRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}) in a ${targetLangName} language learning roleplay. You are also a language coach.

${scenarioContextBlock}

${vocabBlock}

${modeInstruction}

Goals remaining:
${goalsBlock}

RULES FOR GUIDED PHASE:
- Stay in character as ${currentScenario.aiCharacterName} at ALL times. Every response must feel like it belongs to this specific scenario.
- Do NOT greet the student at every turn — you already greeted them at the start of the session. Jump straight into the roleplay dialogue.
- THE GUIDED PHASE IS WHERE COACHING HAPPENS: This is the only phase where you give explanations, corrections, and guidance. Keep the EXPLANATION / CORRECTION / GUIDANCE part short (one sentence of coaching max) — never lecture at length.
- LANGUAGE SEPARATION: Every response has TWO strictly separated parts:
   1. EXPLANATION / CORRECTION / GUIDANCE part: Write in pure ${nativeLangName}. No ${targetLangName}-accented ${nativeLangName} — it must sound like a native ${nativeLangName} speaker wrote it. Keep it to a single short sentence.
   2. ROLEPLAY DIALOGUE part: Write in pure ${targetLangName}. Natural in-character dialogue that advances the scenario. This is the main body of your reply.
- Switch between the two cleanly — don't mix languages in the same sentence.
- Always include romaji in parentheses after any ${targetLangName} text.
- Keep the overall response to 1–3 sentences typically.
- Do NOT include any JSON, markdown, ratings, or meta text.
- CRITICAL: Every response must be grounded in the scenario setting above. Do not generate generic phrases that ignore the situation.
- STRICT NO-LOOP RETRY RULE: If the learner has already attempted this word/phrase/sentence once and it's still not clean, do not ask them to repeat it again. Comment briefly, acknowledge effort, give the correct reference, and move the session forward.
- GOAL-DRIVEN PROGRESS: Every turn you must move the conversation forward toward the remaining [PENDING] goals. Never stall on the same exchange. Aim to complete the lesson session naturally and on time.
- When appropriate, briefly signal what the student should expect next in the session (e.g. moving to a new goal or wrapping up), so the learner never feels like they have to guess what to do — you are always the one steering the conversation forward.

===== OUTPUT FORMAT (MANDATORY) =====
Wrap every ${targetLangName} span — the roleplay line itself plus its romaji in parentheses — in ⟦ ⟧ delimiters. Everything OUTSIDE ⟦ ⟧ must be pure ${nativeLangName}, and everything INSIDE ⟦ ⟧ must be ${targetLangName} (+ romaji). Never place ${nativeLangName} text inside ⟦ ⟧, and never place ${targetLangName} text outside it.

${guidedExample}`;

    const unguidedRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}) in a ${targetLangName} language learning roleplay. This is FULL IMMERSION mode.

${scenarioContextBlock}

${vocabBlock}

${modeInstruction}

Goals remaining:
${goalsBlock}

RULES FOR UNGUIDED PHASE:
- FULL IMMERSION: Reply entirely in ${targetLangName}. Do NOT use ${nativeLangName} for any reason.
- STRICTLY ROLEPLAY, NO COACHING: This phase is pure in-character dialogue. Do NOT give explanations, corrections, feedback, or vocabulary reviews — the guided phase is over. Just act the scene.
- Stay in character as ${currentScenario.aiCharacterName} at all times.
- Do NOT greet the student — you already greeted them at the start of the session. Jump straight into the roleplay.
- Always include romaji in parentheses after every ${targetLangName} sentence.
- Keep responses natural, conversational, and in-character — driven entirely by the scenario setting above.
- Drive the conversation toward completing the remaining goals naturally within the scenario.
- Keep responses to 1–3 sentences typically.
- Do NOT include any JSON, markdown, ratings, or meta text.
- CRITICAL: Every response must be grounded in the specific scenario setting. Never resort to generic greetings or phrases that ignore the situation.
- STRICT NO-LOOP RETRY RULE: If the learner has already attempted a phrase once, do not ask them to repeat it. Move the conversation forward naturally.
- GOAL-DRIVEN PROGRESS: Every turn you must move the conversation forward toward completing the remaining [PENDING] goals. Never stall on the same exchange. Aim to complete the lesson session naturally and on time.
- When appropriate, briefly signal what the student should expect next in the session (e.g. moving to a new goal or wrapping up), so the learner never feels like they have to guess what to do — you are always the one steering the conversation forward.

===== OUTPUT FORMAT (MANDATORY) =====
Wrap every ${targetLangName} span in ⟦ ⟧ delimiters. Since unguided phase is 100% ${targetLangName}, virtually all text should be inside ⟦ ⟧. Include romaji inside the delimiters: ⟦${targetLangName} text (romaji)⟧.

${unguidedExample}`;

    // ── Same-language prompt variants (no dual-language, no delimiters) ──
    const sameLangIcebreakerGreetingRule = isSessionStart
      ? `- This is the FIRST message of the session: greet the student and briefly explain what the scenario is about.`
      : `- Do NOT greet the student again — that already happened at the start of this session. Go straight into teaching/practicing the current word.`;
    const sameLangIcebreakerRules = `
ROLE: You are a TEACHER. Your primary job is TEACHING vocabulary through conversation.

PHASE: ICEBREAKER — You are introducing the student to key vocabulary for the upcoming roleplay scenario described below.

${scenarioContextBlock}

${vocabBlock}

Rules:
- You have EXACTLY ${vocabRows.length} vocabulary word(s) listed above. Teach ONLY these words and in this exact order.
- BREVITY: Keep your entire response to 2-3 sentences max.
${sameLangIcebreakerGreetingRule}
- For each word: present the word, clearly explain its meaning, and ask the student to repeat it.
- Keep your tone encouraging and supportive.
- Do NOT cover multiple words at once. One word per turn.
- After the student attempts a word, give brief feedback, then introduce the next word.
- Mark the vocabulary word by saying "【VOCAB N】" at the start of your teaching turn.
- STRICT NO-LOOP RETRY RULE: If the learner has already attempted this word once and it's still not clean, do not ask them to repeat it again. Comment briefly and move forward.
- Speak naturally in ${targetLangName}. No delimiters, no romaji, no language switching.`;

    const sameLangGuidedRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}).

${scenarioContextBlock}

${vocabBlock}

${modeInstruction}

Goals remaining:
${goalsBlock}

RULES:
- Stay in character as ${currentScenario.aiCharacterName} at all times. Every response must feel like it belongs to this specific scenario.
- Do NOT greet the student — you already greeted them at the start of the session. Jump straight into the roleplay.
- Speak naturally in ${targetLangName}. No coaching, no explanations, no breaking character.
- Keep the overall response to 1–3 sentences typically.
- Do NOT include any JSON, markdown, ratings, or meta text.
- Drive the conversation forward naturally toward completing the remaining goals.
- CRITICAL: Every response must be grounded in the scenario setting above. Never give language lessons or coaching — just act the roleplay.
- STRICT NO-LOOP RETRY RULE: Never loop more than once on the same mistake. Acknowledge and move forward.
- GOAL-DRIVEN PROGRESS: Every turn you must move the conversation forward toward completing the remaining [PENDING] goals. Never stall on the same exchange. Aim to complete the lesson session naturally and on time.
- When appropriate, briefly signal what the student should expect next in the session (e.g. moving to a new goal or wrapping up), so the learner never feels like they have to guess what to do — you are always the one steering the conversation forward.`;

    const sameLangUnguidedRules = `
ROLE: You are ${currentScenario.aiCharacterName} (${currentScenario.aiCharacterRole}).

${scenarioContextBlock}

${modeInstruction}

Goals remaining:
${goalsBlock}

RULES:
- STRICTLY ROLEPLAY, NO COACHING: This phase is pure in-character dialogue. Do NOT give explanations, corrections, feedback, or vocabulary reviews — the guided phase is over. Just act the scene.
- Stay in character as ${currentScenario.aiCharacterName} at all times.
- Do NOT greet the student — you already greeted them at the start of the session. Jump straight into the roleplay.
- Speak naturally in ${targetLangName}. No coaching, no explanations, no breaking character.
- Keep responses to 1–3 sentences typically.
- Do NOT include any JSON, markdown, ratings, or meta text.
- Drive the conversation toward completing the remaining goals naturally within the scenario.
- CRITICAL: Every response must be grounded in the scenario setting. Never resort to generic greetings or phrases that ignore the situation.
- STRICT NO-LOOP RETRY RULE: Never loop on retries. Move forward.
- GOAL-DRIVEN PROGRESS: Every turn you must move the conversation forward toward completing the remaining [PENDING] goals. Never stall on the same exchange. Aim to complete the lesson session naturally and on time.
- When appropriate, briefly signal what the student should expect next in the session (e.g. moving to a new goal or wrapping up), so the learner never feels like they have to guess what to do — you are always the one steering the conversation forward.`;

    const streamSystemPrompt = isSameLanguage
      ? (isOrientation
          ? sameLangOrientationRules
          : currentPhase === 'icebreaker'
            ? (isIcebreakerExhausted || hasNoVocab ? sameLangGuidedRules : sameLangIcebreakerRules)
            : (currentPhase === 'guided' ? sameLangGuidedRules : sameLangUnguidedRules))
      : (isOrientation
          ? orientationRules
          : currentPhase === 'icebreaker'
            ? (isIcebreakerExhausted || hasNoVocab ? guidedRules : icebreakerRules)
            : (currentPhase === 'guided' ? guidedRules : unguidedRules));

    const streamUserMsg = isSessionStart
      ? `[SESSION START] The student is ready to begin. This is the first turn.`
      : userProducedCurrentWord
        ? `[Turn ${currentTurnNo}] The student says: "${effectiveInput}" — and that message ALREADY contains the exact vocabulary word you are currently teaching (word ${currentVocabIndex}). The learner has produced it correctly. Do NOT ask them to repeat it. Acknowledge very briefly (max 5 words) and immediately move on to the next word.`
        : `[Turn ${currentTurnNo}] The student says: "${effectiveInput}"`;

    // ── Build SSE response stream ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: string) => {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            /* client disconnected — ignore */
          }
        };

        try {
          const provider = await getAIProvider();
          let fullAiText = '';
          const streamSanitizer = createStreamTextSanitizer();

          // Phase 1: Stream the AI reply text
          if (forcedAdvanceMessage) {
            // The learner already used their one retry on this word. Don't
            // give the model a chance to ask a third time — hand off to the
            // next word ourselves so the loop can't recur.
            fullAiText = forcedAdvanceMessage;
            const text = streamSanitizer.push(fullAiText) + streamSanitizer.flush();
            if (text) send(JSON.stringify({ type: 'token', text }));
          } else {
            for await (const chunk of provider.generateStream(streamSystemPrompt, [
              ...conversationHistory,
              { role: 'user', content: streamUserMsg },
            ])) {
              fullAiText += chunk;
              const delta = streamSanitizer.push(chunk);
              if (delta) send(JSON.stringify({ type: 'token', text: delta }));
            }
          }

          if (!fullAiText.trim()) {
            fullAiText = `I understand. Please continue with the conversation.`;
            const text = streamSanitizer.push(fullAiText) + streamSanitizer.flush();
            if (text) send(JSON.stringify({ type: 'token', text }));
          } else {
            const tail = streamSanitizer.flush();
            if (tail) send(JSON.stringify({ type: 'token', text: tail }));
          }

          // Keep icebreakerVocabIndex/Attempts authoritative instead of trusting
          // the model to self-track: advance state directly when we forced the
          // turn ourselves, otherwise validate the "【VOCAB N】" marker the model
          // was asked to emit before trusting it to move the index.
          let newVocabIndex = currentVocabIndex;
          let newVocabAttempts = currentVocabAttempts;
          if (currentPhase === 'icebreaker') {
            if (shouldForceAdvanceVocab) {
              // We authored fullAiText ourselves (forcedAdvanceMessage) — advance
              // state directly instead of round-tripping through the marker regex.
              newVocabIndex = currentVocabIndex + 1;
              newVocabAttempts = newVocabIndex <= vocabRows.length ? 1 : 0;
            } else if (userProducedCurrentWord) {
              // The learner's last message already contained the current word, so
              // they've produced it. Advance deterministically instead of waiting
              // for the model to re-emit a "【VOCAB N+1】" marker — and if the model
              // still loops back and repeats the same word, the next turn starts
              // on the new index so the loop can't recur. If the analyzer below
              // flags a real error on this turn, the retry gate returns early and
              // this advance is never persisted.
              newVocabIndex = currentVocabIndex + 1;
              newVocabAttempts = newVocabIndex <= vocabRows.length ? 1 : 0;
            } else {
              // Only trust a marker that matches the current word or steps to the
              // very next one; a missing, malformed, or out-of-range value (e.g. the
              // model hallucinating "【VOCAB 999】" or skipping ahead) can't be used to
              // update the authoritative index, but must still count as a turn spent
              // on the current word so the retry ceiling above still gets hit.
              const parsedIndex = Number(fullAiText.match(/【VOCAB (\d+)】/)?.[1]);
              if (parsedIndex === currentVocabIndex) {
                newVocabAttempts = currentVocabAttempts + 1;
              } else if (parsedIndex === currentVocabIndex + 1 && parsedIndex <= vocabRows.length) {
                newVocabIndex = parsedIndex;
                newVocabAttempts = 1;
              } else {
                newVocabAttempts = currentVocabAttempts + 1;
              }
            }
          }

          // Validate ⟦ ⟧ delimiter usage when languages differ
          const targetBcp47 = getBCP47(targetLanguage, 'tts');
          const nativeBcp47 = getBCP47(nativeLanguage, 'tts');
          if (!isSameLanguage) {
            const validation = validateDelimiters(fullAiText, targetBcp47, nativeBcp47);
            if (!validation.valid) {
              console.warn('[SPAN VALIDATOR] delimiter issues:', validation.issues);
            }
          }

          // Phase 2: Analyze the user's turn (skip for session start greeting)
          if (isSessionStart) {
            let aiConversationId: number | null = null;
            const { newPhase: sessionStartPhase, phaseChanged } = await withSessionLock(numericSessionId, async (tx) => {
              const [freshSession] = await tx.select().from(sessions).where(eq(sessions.id, numericSessionId));
              if (freshSession.status === 'completed') throw new Error('Session was completed by another request');

              const existingGreeting = await tx.select({ id: conversations.id })
                .from(conversations)
                .where(and(
                  eq(conversations.sessionId, numericSessionId),
                  eq(conversations.turnNo, currentTurnNo)
                ))
                .limit(1);
              if (existingGreeting.length > 0) throw new Error('Session start already processed');

              const [aiConversation] = await tx.insert(conversations).values({
                sessionId: numericSessionId,
                turnNo: currentTurnNo,
                speaker: 'ai',
                messageTarget: fullAiText,
                messageNative: '',
                messagePhonetic: null,
                isValidInContext: true,
              }).returning({ id: conversations.id });

              aiConversationId = aiConversation?.id ?? null;

              const icebreakerDoneInner = currentPhase === 'icebreaker'
                ? (vocabRows.length > 0 ? newVocabIndex > vocabRows.length : true)
                : false;
              const newPhaseInner = nextPhase(currentPhase, { icebreakerDone: icebreakerDoneInner, allGoalsCovered: false });

              await tx.update(sessions).set({
                phase: newPhaseInner,
                totalTurns: currentTurnNo,
                status: 'active',
                lastActiveAt: new Date(),
                stalledTurnCount: 0,
                icebreakerVocabIndex: newVocabIndex,
                icebreakerVocabAttempts: newVocabAttempts,
              }).where(eq(sessions.id, numericSessionId));

              return { newPhase: newPhaseInner, phaseChanged: newPhaseInner !== currentPhase };
            });

            if (aiConversationId) {
              const jobId = await enqueueAudioJob(
                aiConversationId,
                numericSessionId,
                fullAiText,
                targetBcp47,
                currentPhase,
                'ai',
                session.voiceGender ?? undefined,
              );
              await dispatchAudioJob(jobId, aiConversationId, numericSessionId);
            }

            if (phaseChanged) {
              send(JSON.stringify({
                type: 'phase_transition',
                fromPhase: currentPhase,
                toPhase: sessionStartPhase,
                message: '',
              }));
            }

            send(JSON.stringify({
              type: 'done',
              fullText: sanitizeStreamedChunk(fullAiText),
              phase: sessionStartPhase,
              analysis: { corrections: [], suggestedReplies: [] },
            }));
            try { controller.close(); } catch {}
            return;
          }

          const analysis = await analyzeTurn({
            userInput: userRawInput,
            aiReplyText: fullAiText,
            scenario: currentScenario,
            data: turnData,
          });

          const correctionItems = analysis.corrections ?? [];
          const hasLowPronunciation = accuracyScore !== null && accuracyScore < PRONUNCIATION_PASS_THRESHOLD;
          if (hasLowPronunciation && !correctionItems.some(c => c.correctionType === 'pronunciation')) {
            correctionItems.unshift({
              correctionType: 'pronunciation',
              originalText: userRawInput,
              correctedText: userRawInput,
              explanation: `Pronunciation score was ${accuracyScore}% (target: ${PRONUNCIATION_PASS_THRESHOLD}%+). Let's practice saying this once more.`,
              severity: 'minor',
            });
          }
          const hasCorrections = (correctionItems.length > 0 && correctionItems.some(c => c.correctedText)) || hasLowPronunciation;

          // ── Phase-agnostic retry gate (bounded to exactly 1 retry) ──
          let pendingRetryCorrectionId: number | null = null;
          let retryEarlyExit = false;

          if (hasCorrections && currentPhase !== 'orientation') {
            const prevPendingId = session.pendingRetryCorrectionId;

            if (prevPendingId && isRetryOfPreviousMistake) {
              await withSessionLock(numericSessionId, async (tx) => {
                if (prevPendingId) {
                  await tx.update(corrections).set({
                    isFinalAttempt: true,
                  }).where(eq(corrections.id, prevPendingId));
                }
                await tx.update(sessions).set({
                  pendingRetryCorrectionId: null,
                  lastActiveAt: new Date(),
                }).where(eq(sessions.id, numericSessionId));
              });
            } else if (!prevPendingId && !isRetryOfPreviousMistake) {
              const validCorrections = correctionItems.filter(c => c.correctedText);
              if (validCorrections.length > 0) {
                const { newPendingRetryId, userConvId } = await withSessionLock(numericSessionId, async (tx) => {
                  const [freshSession] = await tx.select().from(sessions).where(eq(sessions.id, numericSessionId));
                  if (freshSession.status === 'completed') throw new Error('Session was completed by another request');

                  const existingTurn = await tx.select({ id: conversations.id })
                    .from(conversations)
                    .where(and(
                      eq(conversations.sessionId, numericSessionId),
                      eq(conversations.turnNo, currentTurnNo)
                    ))
                    .limit(1);
                  if (existingTurn.length > 0) throw new Error('Turn already processed');

                  const [userConversation] = await tx.insert(conversations).values({
                    sessionId: numericSessionId,
                    turnNo: currentTurnNo,
                    speaker: 'user',
                    messageTarget: analysis.messageTarget,
                    messageNative: analysis.messageNative,
                    messagePhonetic: analysis.messagePhonetic,
                    emotionTone: analysis.emotionTone ?? null,
                    gestureHint: analysis.gestureHint ?? null,
                    responseTimeMs,
                  }).returning({ id: conversations.id });

                  const inserted = await tx.insert(corrections).values(
                    validCorrections.map(c => ({
                      conversationId: userConversation.id,
                      correctionType: c.correctionType,
                      originalText: c.originalText,
                      originalPhonetic: c.originalPhonetic ?? null,
                      correctedText: c.correctedText,
                      correctedPhonetic: c.correctedPhonetic ?? null,
                      explanation: c.explanation,
                      severity: c.severity,
                    }))
                  ).returning({ id: corrections.id });

                  const newPendingId = inserted[0]?.id ?? null;
                  if (newPendingId) {
                    await tx.update(sessions).set({
                      pendingRetryCorrectionId: newPendingId,
                      lastActiveAt: new Date(),
                    }).where(eq(sessions.id, numericSessionId));
                  }

                  return { newPendingRetryId: newPendingId, userConvId: userConversation.id };
                });

                pendingRetryCorrectionId = newPendingRetryId;
              }

              send(JSON.stringify({
                type: 'retry',
                analysis: {
                  messageTarget: analysis.messageTarget,
                  messageNative: analysis.messageNative,
                  messagePhonetic: analysis.messagePhonetic,
                  emotionTone: analysis.emotionTone,
                  gestureHint: analysis.gestureHint,
                  corrections: correctionItems.map(c => ({
                    ...c,
                    originalPhonetic: c.originalPhonetic ?? null,
                    correctedPhonetic: c.correctedPhonetic ?? null,
                  })),
                  suggestedReplies: analysis.suggestedReplies ?? [],
                },
              }));
              try { controller.close(); } catch {}
              return;
            }
          }

          // ── Wrap all writes in a transaction with session lock ──
          const writeResult = await withSessionLock(numericSessionId, async (tx) => {
            const [freshSession] = await tx.select().from(sessions).where(eq(sessions.id, numericSessionId));
            if (freshSession.status === 'completed') throw new Error('Session was completed by another request');

            const existingTurn = await tx.select({ id: conversations.id })
              .from(conversations)
              .where(and(
                eq(conversations.sessionId, numericSessionId),
                eq(conversations.turnNo, currentTurnNo)
              ))
              .limit(1);
            if (existingTurn.length > 0) throw new Error('Turn already processed by a concurrent request');

            const freshPhaseTurnCount = freshSession.phaseTurnCount ?? 0;

            const [userConversation] = await tx.insert(conversations).values({
              sessionId: numericSessionId,
              turnNo: currentTurnNo,
              speaker: 'user',
              messageTarget: analysis.messageTarget,
              messageNative: analysis.messageNative,
              messagePhonetic: analysis.messagePhonetic,
              emotionTone: analysis.emotionTone ?? null,
              gestureHint: analysis.gestureHint ?? null,
              responseTimeMs,
            }).returning({ id: conversations.id });

            if (hasCorrections) {
              const validCorrections = correctionItems.filter(c => c.correctedText);
              if (validCorrections.length > 0) {
                await tx.insert(corrections).values(
                  validCorrections.map(c => ({
                    conversationId: userConversation.id,
                    correctionType: c.correctionType,
                    originalText: c.originalText,
                    originalPhonetic: c.originalPhonetic ?? null,
                    correctedText: c.correctedText,
                    correctedPhonetic: c.correctedPhonetic ?? null,
                    explanation: c.explanation,
                    severity: c.severity,
                  }))
                );
              }
            }

            const [aiConversation] = await tx.insert(conversations).values({
              sessionId: numericSessionId,
              turnNo: currentTurnNo,
              speaker: 'ai',
              messageTarget: fullAiText,
              messageNative: '',
              messagePhonetic: null,
              isValidInContext: true,
            }).returning({ id: conversations.id });

            if (analysis.goalsAddressedThisTurn?.length > 0) {
              const goalsMap = new Map(goals.map(g => [g.sequenceOrder, g.id]));
              const seen = new Set<number>();
              const completionRows = analysis.goalsAddressedThisTurn
                .filter(seqOrder => goalsMap.has(seqOrder))
                .filter(seqOrder => !completedSequenceOrders.includes(seqOrder))
                .filter(seqOrder => {
                  if (seen.has(seqOrder)) return false;
                  seen.add(seqOrder);
                  return true;
                })
                .map(seqOrder => ({
                  sessionId: numericSessionId,
                  conversationId: userConversation.id,
                  scenarioGoalId: goalsMap.get(seqOrder)!,
                  achieved: true,
                  evidenceNote: `Addressed in turn ${currentTurnNo}: "${userRawInput.substring(0, 80)}"`
                }));
              if (completionRows.length > 0) {
                await tx.insert(goalCompletions).values(completionRows);
              }
            }

            let runningScoreInner = freshSession.runningScore;
            if (currentPhase === 'unguided' && hasCorrections) {
              runningScoreInner -= correctionItems.filter(c => c.correctedText).length * UNGUIDED_MISTAKE_PENALTY;
              if (analysis.isEnglishWhenExpected) {
                runningScoreInner -= UNGUIDED_ENGLISH_PENALTY;
              }
              if (runningScoreInner < 0) runningScoreInner = 0;
            }

            const goalsCompleted = analysis.goalsAddressedThisTurn?.filter(
              seqOrder => !completedSequenceOrders.includes(seqOrder)
            ).length ?? 0;
            const newStalledTurnCount = goalsCompleted > 0 ? 0 : ((freshSession.stalledTurnCount ?? 0) + 1);
            const isStalled = (currentPhase === 'guided' || currentPhase === 'unguided')
              && newStalledTurnCount >= STALL_THRESHOLD;
            const isSafetyCapped = currentTurnNo >= SAFETY_CAP_TURN;
            const totalGoalsNow = completedSequenceOrders.length + goalsCompleted;
            const allGoalsCoveredInner = isStalled || isSafetyCapped || totalGoalsNow >= goals.length;

            const icebreakerDoneInner = currentPhase === 'icebreaker'
              ? (vocabRows.length > 0 ? newVocabIndex > vocabRows.length : true)
              : false;
            const newPhaseInner = nextPhase(currentPhase, {
              icebreakerDone: icebreakerDoneInner,
              allGoalsCovered: allGoalsCoveredInner,
            });
            const shouldCompleteInner = currentPhase !== 'orientation' && currentPhase !== 'icebreaker'
              && (analysis.scenarioComplete || (currentPhase === 'unguided' && (allGoalsCoveredInner || isSafetyCapped)));

            let newPhaseTurnCount = freshPhaseTurnCount;
            if (newPhaseInner !== currentPhase) {
              newPhaseTurnCount = 0;
            } else {
              newPhaseTurnCount++;
            }

            const isCelebrationInner = shouldCompleteInner && allGoalsCoveredInner && (currentPhase === 'unguided' || newPhaseInner === 'evaluation');

            const currentVocabScore = freshSession.vocabularyScore ?? 0;
            const currentGrammarScore = freshSession.grammarScore ?? 0;
            const currentFluencyScore = freshSession.fluencyScore ?? 0;
            const currentCulturalScore = freshSession.culturalScore ?? 0;
            const currentTaskScore = freshSession.taskScore ?? 0;
            const currentExpressionScore = freshSession.expressionAppropriatenessScore ?? 0;

            const scoredTurnsCount = Math.max(1, Math.floor((turnData.userTurnCount) + 1));

            const blendedVocab = Math.round(((currentVocabScore * (scoredTurnsCount - 1)) + analysis.scores.vocabulary) / scoredTurnsCount);
            const blendedGrammar = Math.round(((currentGrammarScore * (scoredTurnsCount - 1)) + analysis.scores.grammar) / scoredTurnsCount);
            const blendedFluency = Math.round(((currentFluencyScore * (scoredTurnsCount - 1)) + analysis.scores.fluency) / scoredTurnsCount);
            const blendedCultural = Math.round(((currentCulturalScore * (scoredTurnsCount - 1)) + analysis.scores.cultural) / scoredTurnsCount);
            const blendedTask = Math.round(((currentTaskScore * (scoredTurnsCount - 1)) + analysis.scores.task) / scoredTurnsCount);
            const blendedExpression = Math.round(((currentExpressionScore * (scoredTurnsCount - 1)) + (analysis.scores as any).expressionAppropriateness) / scoredTurnsCount);

            const updateData: Record<string, unknown> = {
              totalTurns: currentTurnNo,
              phaseTurnCount: newPhaseTurnCount,
              stalledTurnCount: newStalledTurnCount,
              lastActiveAt: new Date(),
              runningScore: runningScoreInner,
              phase: shouldCompleteInner ? 'completed' : newPhaseInner,
              icebreakerVocabIndex: newVocabIndex,
              icebreakerVocabAttempts: newVocabAttempts,
              vocabularyScore: blendedVocab,
              grammarScore: blendedGrammar,
              fluencyScore: blendedFluency,
              culturalScore: blendedCultural,
              taskScore: blendedTask,
              expressionAppropriatenessScore: blendedExpression,
            };

            if (shouldCompleteInner) {
              updateData.status = 'completed';
              updateData.completedAt = new Date();
              updateData.feedback = analysis.feedback;
            }

            if (freshSession.status === 'paused' && !shouldCompleteInner) {
              updateData.status = 'active';
            }

            await tx.update(sessions).set(updateData).where(eq(sessions.id, numericSessionId));

            if (shouldCompleteInner) {
              const [icebreakerStats] = await tx
                .select({
                  total: sql<number>`count(*)::int`,
                  passed: sql<number>`count(*) filter (where used_correctly = true)::int`,
                })
                .from(vocabularyEncounters)
                .where(and(
                  eq(vocabularyEncounters.sessionId, numericSessionId),
                  eq(vocabularyEncounters.phase, 'icebreaker'),
                ));

              const icebreakerPassRate = icebreakerStats && icebreakerStats.total > 0
                ? Math.round((icebreakerStats.passed / icebreakerStats.total) * 100)
                : 0;

              const finalVocabScore = Math.round((blendedVocab + icebreakerPassRate) / 2);
              const finalFluencyScore = Math.round((blendedFluency + runningScoreInner) / 2);
              const finalTaskScore = Math.round((blendedTask + runningScoreInner) / 2);

              const compositeScore = computeCompositeScore('completed', {
                vocabularyScore: finalVocabScore,
                grammarScore: blendedGrammar,
                fluencyScore: finalFluencyScore,
                culturalScore: blendedCultural,
                taskScore: finalTaskScore,
                expressionAppropriatenessScore: blendedExpression,
              });
              const isPassed = compositeScore >= PASSING_SCORE_THRESHOLD;
              const celebrationVariant: 'scenario-mastery' | 'needs-practice' = isPassed ? 'scenario-mastery' : 'needs-practice';

              await tx.insert(evaluations).values({
                sessionId: numericSessionId,
                vocabularyScore: finalVocabScore,
                grammarScore: blendedGrammar,
                fluencyScore: finalFluencyScore,
                culturalScore: blendedCultural,
                taskScore: finalTaskScore,
                expressionAppropriatenessScore: blendedExpression,
                feedback: analysis.feedback,
              });

              const totalScore = finalVocabScore + blendedGrammar + finalFluencyScore + blendedCultural + finalTaskScore + blendedExpression;
              const xpGained = Math.round(totalScore * 2.5 + 25);
              let newStreak: number | null = null;

              const [userRow] = await tx.select({
                xp: users.xp, streak: users.streak, lastActiveDate: users.lastActiveDate,
              }).from(users).where(eq(users.id, user.id));

              if (userRow) {
                const today = new Date().toISOString().slice(0, 10);
                const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                let streak = userRow.streak;
                if (userRow.lastActiveDate === today) {
                  // same day
                } else if (userRow.lastActiveDate === yesterday) {
                  streak += 1;
                } else {
                  streak = 1;
                }
                newStreak = streak;

                const newXp = userRow.xp + xpGained;
                let newLevel: string;
                let newXpToNext: number;
                if (newXp >= 6000) {
                  newLevel = 'advanced';
                  newXpToNext = 10000;
                } else if (newXp >= 2000) {
                  newLevel = 'intermediate';
                  newXpToNext = 6000;
                } else {
                  newLevel = 'beginner';
                  newXpToNext = 2000;
                }

                await tx.update(users).set({
                  xp: newXp, level: newLevel, xpToNext: newXpToNext,
                  streak: newStreak, lastActiveDate: today,
                }).where(eq(users.id, user.id));
              }

              return {
                newPhase: newPhaseInner,
                runningScore: runningScoreInner,
                isCelebration: isCelebrationInner || shouldCompleteInner,
                celebrationVariant,
                compositeScore,
                passed: isPassed,
                xpGained,
                newStreak,
                aiConversationId: aiConversation?.id ?? null,
                shouldComplete: shouldCompleteInner,
              };
            }

            return {
              newPhase: newPhaseInner,
              runningScore: runningScoreInner,
              isCelebration: isCelebrationInner,
              celebrationVariant: 'scenario-mastery' as const,
              compositeScore: 0,
              passed: false,
              xpGained: null as number | null,
              newStreak: null as number | null,
              aiConversationId: aiConversation?.id ?? null,
              shouldComplete: shouldCompleteInner,
            };
          });

          if (writeResult.aiConversationId) {
            enqueueAudioJob(
              writeResult.aiConversationId,
              numericSessionId,
              fullAiText,
              targetBcp47,
              currentPhase,
              'ai',
              session.voiceGender ?? undefined,
            );
          }

          // ── Phase transition announcement & SSE event broadcast ──
          if (writeResult.newPhase !== currentPhase && !writeResult.shouldComplete) {
            let transitionKind: PhaseMessageKind | null = null;
            if (currentPhase === 'orientation' && writeResult.newPhase === 'icebreaker') {
              transitionKind = 'to-icebreaker';
            } else if (currentPhase === 'icebreaker' && writeResult.newPhase === 'guided') {
              transitionKind = 'to-guided';
            } else if (currentPhase === 'guided' && writeResult.newPhase === 'unguided') {
              transitionKind = 'to-unguided';
            } else if (currentPhase === 'unguided' && writeResult.newPhase === 'evaluation') {
              transitionKind = 'to-evaluation';
            }
            let transitionMsg = '';
            if (transitionKind) {
              transitionMsg = await generateLocalizedPhaseMessage(
                provider,
                targetLanguage,
                nativeLanguage,
                currentScenario.aiCharacterName,
                transitionKind,
              );
              if (transitionMsg) {
                const appended = `\n\n${sanitizeStreamedChunk(transitionMsg)}`;
                fullAiText += appended;
                send(JSON.stringify({ type: 'token', text: appended }));
              }
            }

            send(JSON.stringify({
              type: 'phase_transition',
              fromPhase: currentPhase,
              toPhase: writeResult.newPhase,
              message: sanitizeStreamedChunk(transitionMsg),
            }));
          }

          if (writeResult.isCelebration) {
            const celebrationMsg = await generateLocalizedPhaseMessage(
              provider,
              targetLanguage,
              nativeLanguage,
              currentScenario.aiCharacterName,
              'celebration',
            );
            if (celebrationMsg) {
              const appended = `\n\n🎉 ${sanitizeStreamedChunk(celebrationMsg)}`;
              fullAiText += appended;
              send(JSON.stringify({ type: 'token', text: appended }));
            }
          }

          const responseCorrections = currentPhase === 'unguided' ? [] : (correctionItems ?? []);

          // ── Send final event ──
          send(JSON.stringify({
            type: 'done',
            fullText: sanitizeStreamedChunk(fullAiText),
            phase: writeResult.newPhase,
            runningScore: writeResult.runningScore,
            celebration: writeResult.isCelebration,
            celebrationVariant: writeResult.celebrationVariant,
            compositeScore: writeResult.compositeScore,
            passed: writeResult.passed,
            xpGained: writeResult.xpGained,
            newStreak: writeResult.newStreak,
            analysis: {
              messageTarget: analysis.messageTarget,
              messageNative: analysis.messageNative,
              messagePhonetic: analysis.messagePhonetic,
              emotionTone: analysis.emotionTone,
              gestureHint: analysis.gestureHint,
              corrections: responseCorrections,
              suggestedReplies: analysis.suggestedReplies ?? [],
              scores: analysis.scores,
              feedback: analysis.feedback,
              goalsAddressedThisTurn: analysis.goalsAddressedThisTurn,
              scenarioComplete: writeResult.shouldComplete,
            },
          }));

          try { controller.close(); } catch {}
        } catch (err) {
          // Clean up pendingRetryCorrectionId on error to prevent stuck sessions
          try {
            await db.update(sessions).set({
              pendingRetryCorrectionId: null,
            }).where(and(
              eq(sessions.id, numericSessionId),
              sql`pending_retry_correction_id IS NOT NULL`
            ));
          } catch { /* non-critical cleanup */ }

          if (err instanceof AIQuotaError) {
            send(JSON.stringify({ type: 'error', code: 'quota', message: err.message }));
          } else if (err instanceof AIModelError) {
            send(JSON.stringify({ type: 'error', code: 'model', message: err.message }));
          } else if (err instanceof AIProviderError) {
            send(JSON.stringify({ type: 'error', code: 'provider', message: err.message }));
          } else {
            const msg = err instanceof Error ? err.message : 'Internal server error';
            send(JSON.stringify({ type: 'error', code: 'internal', message: msg }));
          }
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[STREAM CHAT] Unhandled error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
