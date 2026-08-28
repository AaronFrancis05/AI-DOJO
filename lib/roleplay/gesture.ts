import { getGreetingGesture } from '../language';
import type { GestureHint } from '../ai-engine';

/* ── Overview ───────────────────────────────────────────────────────────
   Which gesture the character makes on the line it is about to speak.

   The model already returns a `gestureHint`, but it rides the analysis, which
   the stream route sends on `done` — after `text_done`, i.e. after speech has
   already begun. A bow that lands then is always a beat late, and a bow is the
   one gesture whose whole meaning is that it happens WITH the greeting.

   So the reply text is matched here, on the server, the moment it is complete,
   and emitted as its own SSE event immediately after `text_done`. The model's
   hint still arrives later and refines subsequent turns; this only has to be
   right about the obvious cases, and being early is what makes it useful.
   ────────────────────────────────────────────────────────────────────── */

interface GestureTerms {
  /** Greeting and leave-taking — bow or wave, per the language's culture. */
  greeting: string[];
  /** Thanks and apology — a deeper version of the same gesture. */
  gratitude: string[];
}

/**
 * Matched case-insensitively against the reply text. Deliberately short: these
 * are the fixed, unambiguous social formulas, not general vocabulary. A term
 * that also occurs mid-sentence in ordinary speech would fire the gesture on
 * lines that aren't greetings, which reads worse than no gesture at all.
 *
 * Same shape and same fallback rule as lib/roleplay/prompts/icebreaker-phrases.ts:
 * a language with no entry simply never matches, and the model's hint is left
 * to decide.
 */
const GESTURE_TERMS: Record<string, GestureTerms> = {
  ja: {
    greeting: ['こんにちは', 'おはよう', 'こんばんは', 'はじめまして', 'よろしくお願い', 'さようなら', 'いらっしゃいませ', 'また今度', 'お疲れ様'],
    gratitude: ['ありがとう', 'すみません', '申し訳', 'ごめんなさい', 'お世話になり'],
  },
  ko: {
    greeting: ['안녕하세요', '안녕히', '반갑습니다', '처음 뵙겠습니다', '어서 오세요'],
    gratitude: ['감사합니다', '고맙습니다', '죄송합니다', '미안합니다'],
  },
  zh: {
    greeting: ['你好', '您好', '早上好', '晚上好', '再见', '欢迎光临', '初次见面'],
    gratitude: ['谢谢', '对不起', '不好意思', '抱歉'],
  },
  th: {
    greeting: ['สวัสดี', 'ยินดีที่ได้รู้จัก', 'ลาก่อน'],
    gratitude: ['ขอบคุณ', 'ขอโทษ'],
  },
  en: {
    greeting: ['hello', 'hi there', 'good morning', 'good afternoon', 'good evening', 'nice to meet you', 'welcome', 'goodbye'],
    gratitude: ['thank you', 'thanks', "i'm sorry", 'my apologies'],
  },
  fr: {
    greeting: ['bonjour', 'bonsoir', 'salut', 'enchanté', 'bienvenue', 'au revoir', 'à bientôt'],
    gratitude: ['merci', 'pardon', 'désolé', 'je vous prie de'],
  },
  es: {
    greeting: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'mucho gusto', 'bienvenido', 'adiós', 'hasta luego'],
    gratitude: ['gracias', 'perdón', 'lo siento', 'disculpe'],
  },
  de: {
    greeting: ['hallo', 'guten morgen', 'guten tag', 'guten abend', 'freut mich', 'willkommen', 'auf wiedersehen', 'tschüss'],
    gratitude: ['danke', 'entschuldigung', 'es tut mir leid'],
  },
  it: {
    greeting: ['ciao', 'buongiorno', 'buonasera', 'piacere', 'benvenuto', 'arrivederci'],
    gratitude: ['grazie', 'scusi', 'mi dispiace'],
  },
  pt: {
    greeting: ['olá', 'bom dia', 'boa tarde', 'boa noite', 'prazer', 'bem-vindo', 'adeus', 'até logo'],
    gratitude: ['obrigado', 'obrigada', 'desculpe', 'sinto muito'],
  },
  sw: {
    greeting: ['habari', 'jambo', 'hujambo', 'karibu', 'kwaheri', 'shikamoo'],
    gratitude: ['asante', 'samahani', 'pole'],
  },
  ar: {
    greeting: ['مرحبا', 'السلام عليكم', 'صباح الخير', 'مساء الخير', 'أهلا', 'مع السلامة'],
    gratitude: ['شكرا', 'آسف', 'عفوا'],
  },
};

/**
 * Reads a gesture out of the line the character is about to say.
 *
 * Returns 'none' — not a guess — whenever nothing matches, so the model's own
 * hint stays in charge of everything this doesn't cover.
 */
export function inferGesture(replyText: string, targetLanguage: string): GestureHint {
  const terms = GESTURE_TERMS[targetLanguage];
  if (!terms || !replyText) return 'none';

  const haystack = replyText.toLowerCase();
  const hit = (list: string[]) => list.some(term => haystack.includes(term.toLowerCase()));

  // Gratitude and apology are checked first: "ありがとう。さようなら。" is
  // primarily a thank-you, and in every culture that bows, both are the same
  // gesture anyway.
  if (hit(terms.gratitude) || hit(terms.greeting)) {
    return getGreetingGesture(targetLanguage);
  }

  return 'none';
}
