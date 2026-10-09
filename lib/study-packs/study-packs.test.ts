import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryFromCorrectionType,
  normalizePattern,
  parseClassification,
  planWeakPointUpdates,
  selectFocusWeakPoints,
  weakPointKey,
  type ExistingWeakPoint,
  type SessionCorrection,
} from './weak-points';
import { parseStudyPack } from './pack';
import { checkAnswer } from './answer-match';
import { grammarCard, parseCardPayload, sentenceCard } from './cards';
import { WEAK_POINT_RESOLVE_AFTER } from './config';

const corrections: SessionCorrection[] = [
  { id: 1, correctionType: 'grammar', originalText: 'I goed', correctedText: 'I went', explanation: 'irregular' },
  { id: 2, correctionType: 'politeness', originalText: 'Give me water', correctedText: 'Could I have some water?', explanation: 'too direct' },
];

test('correction types fold into the four categories', () => {
  assert.equal(categoryFromCorrectionType('Grammar'), 'grammar');
  assert.equal(categoryFromCorrectionType('vocabulary'), 'vocab');
  assert.equal(categoryFromCorrectionType('pronunciation'), 'pronunciation');
  assert.equal(categoryFromCorrectionType('cultural'), 'register');
  assert.equal(categoryFromCorrectionType(undefined), 'grammar');
});

test('pattern labels normalize case, spacing and trailing punctuation', () => {
  assert.equal(normalizePattern('  Past Simple  of irregular verbs. '), 'past simple of irregular verbs');
});

test('classification keeps only known ids, once each, and repairs bad categories', () => {
  const raw = JSON.stringify({
    items: [
      { id: 1, category: 'grammar', pattern: 'Past simple of irregular verbs' },
      { id: 1, category: 'grammar', pattern: 'duplicate' },
      { id: 2, category: 'nonsense', pattern: 'polite requests' },
      { id: 99, category: 'grammar', pattern: 'unknown id' },
      { id: 2, category: 'register', pattern: '' },
    ],
  });
  const hits = parseClassification(raw, corrections);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].pattern, 'past simple of irregular verbs');
  assert.equal(hits[1].category, 'register');
  assert.equal(hits[1].example, 'Give me water → Could I have some water?');
});

const point = (over: Partial<ExistingWeakPoint>): ExistingWeakPoint => ({
  id: 1, category: 'grammar', pattern: 'articles', count: 1, cleanSessionCount: 0,
  lastSeenAt: new Date('2026-10-01'), resolvedAt: null, ...over,
});

test('a pattern seen again is upserted, an unseen open one counts a clean session', () => {
  const plan = planWeakPointUpdates(
    [point({ id: 1, pattern: 'articles' }), point({ id: 2, pattern: 'plurals', cleanSessionCount: WEAK_POINT_RESOLVE_AFTER - 1 })],
    [
      { correctionId: 1, category: 'grammar', pattern: 'articles', example: 'a → an' },
      { correctionId: 2, category: 'grammar', pattern: 'articles', example: 'the → a' },
    ],
  );
  assert.deepEqual(plan.upserts, [{ category: 'grammar', pattern: 'articles', example: 'the → a', occurrences: 2 }]);
  assert.deepEqual(plan.untouched, [{ id: 2, cleanSessionCount: WEAK_POINT_RESOLVE_AFTER, resolve: true }]);
});

test('resolved weak points are left alone when not seen', () => {
  const plan = planWeakPointUpdates([point({ resolvedAt: new Date() })], []);
  assert.deepEqual(plan.untouched, []);
});

test('focus puts this session first, then frequency', () => {
  const open = [
    point({ id: 1, pattern: 'a', count: 9 }),
    point({ id: 2, pattern: 'b', count: 1 }),
    point({ id: 3, pattern: 'c', count: 5 }),
  ];
  const picked = selectFocusWeakPoints(open, new Set([weakPointKey('grammar', 'b')]), 2);
  assert.deepEqual(picked.map((p) => p.id), [2, 1]);
});

const focus = [{ category: 'grammar', pattern: 'past simple of irregular verbs', example: null, count: 2 }];

test('a pack keeps valid parts, drops invented patterns and scenario ids', () => {
  const draft = parseStudyPack(JSON.stringify({
    explanation: 'よくできました。',
    focus: [
      { pattern: 'Past simple of irregular verbs', title: '不規則動詞の過去形', rule: 'go は went になります。', example: 'I went home.' },
      { pattern: 'invented', title: 'x', rule: 'y', example: 'z' },
    ],
    drills: [
      { pattern: 'past simple of irregular verbs', incorrect: 'She goed.', corrected: 'She went.', note: '…' },
      { incorrect: 'same', corrected: 'same' },
    ],
    dialogues: [
      { title: '駅で', lines: [{ speaker: 'partner', text: 'Where did you go?', translation: 'どこへ？' }, { speaker: 'learner', text: 'I went to Tokyo.', translation: '東京へ。' }] },
      { title: 'no learner line', lines: [{ speaker: 'partner', text: 'Hi' }, { speaker: 'partner', text: 'Bye' }] },
    ],
    nextScenario: { id: 404, reason: 'x' },
  }), { focus, candidateIds: [7] });
  assert.equal(draft.focus.length, 1);
  assert.equal(draft.drills.length, 1);
  assert.equal(draft.dialogues.length, 1);
  assert.equal(draft.nextScenario, null);
});

test('a pack with nothing to practise is rejected so the job retries', () => {
  assert.throws(() => parseStudyPack(JSON.stringify({ explanation: 'x', drills: [], dialogues: [] }), { focus, candidateIds: [] }));
});

test('answers pass on a small slip and fail on a different sentence', () => {
  assert.equal(checkAnswer('I went to the station.', 'i went to the station').correct, true);
  assert.equal(checkAnswer('I went to the station yesterday.', 'I went to station yesterday').correct, true);
  assert.equal(checkAnswer('I went to the station.', 'I like apples').correct, false);
  assert.equal(checkAnswer('駅に行きました', '駅に行きました。').correct, true);
  assert.equal(checkAnswer('anything', '   ').correct, false);
});

test('cards round-trip through their stored JSON', () => {
  const s = sentenceCard({ incorrect: 'She goed.', corrected: 'She went.', note: 'irregular', pattern: 'p' });
  assert.deepEqual(parseCardPayload(JSON.stringify(s)), s);
  const g = grammarCard({ category: 'grammar', pattern: 'p', title: 't', rule: 'r', example: 'e' });
  assert.equal(parseCardPayload(JSON.stringify(g))?.frontIsTarget, false);
  assert.equal(parseCardPayload('{"front": 1}'), null);
  assert.equal(parseCardPayload('not json'), null);
});

test('interests are trimmed, deduplicated, capped, and survive a malformed column', async () => {
  const { sanitizeInterests, parseInterests, serializeInterests, MAX_INTERESTS } = await import('./profile');
  assert.deepEqual(sanitizeInterests([' Travel ', 'travel', 3, '', 'Food']), ['Travel', 'Food']);
  assert.equal(sanitizeInterests(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, MAX_INTERESTS);
  assert.deepEqual(parseInterests(serializeInterests(['Music'])), ['Music']);
  assert.deepEqual(parseInterests('not json'), []);
  assert.equal(serializeInterests([]), null);
});

test('a personalized scenario needs goals and vocabulary, and drops sentence-like words', async () => {
  const { parsePersonalizedScenario } = await import('./personalized-scenario');
  const scene = { title: 'Ward handover', context: 'You hand over a patient.', learningGoals: '', aiCharacterRole: 'Night nurse', userCharacterRole: 'Day nurse' };
  const raw = (vocabCount: number) => JSON.stringify({
    base: { ...scene, aiCharacterName: 'Sam', businessType: 'Hospital' },
    targetScene: null,
    native: { ...scene, title: '申し送り' },
    goals: [
      { goalText: 'Report vital signs', goalNative: 'バイタルを報告する', targetPhrase: 'His blood pressure is' },
      { goalText: 'Ask about medication', goalNative: null, targetPhrase: 'Has he had his' },
    ],
    vocabulary: [
      ...Array.from({ length: vocabCount }, (_, i) => ({ targetText: `word ${i}`, translation: `語${i}` })),
      { targetText: 'This is a whole sentence.', translation: 'x' },
    ],
  });
  const draft = parsePersonalizedScenario(raw(4), { targetLanguage: 'en', nativeLanguage: 'ja' });
  assert.equal(draft.targetScene, null);
  assert.equal(draft.native?.title, '申し送り');
  assert.equal(draft.vocabulary.length, 4);
  assert.equal(draft.base.learningGoals, 'Report vital signs\nAsk about medication');
  assert.throws(() => parsePersonalizedScenario(raw(1), { targetLanguage: 'en', nativeLanguage: 'ja' }));
});
