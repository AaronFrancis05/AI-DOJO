import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTranscript, parseStoredTranscript, transcriptToText } from './transcript';
import {
  MAX_TRANSCRIPT_TEXT_CHARS,
  MAX_TRANSCRIPT_TOTAL_CHARS,
  MAX_TRANSCRIPT_TURNS,
} from './config';

/**
 * `normalizeTranscript` is the boundary where a browser-authored payload
 * becomes a database row. The Live socket runs browser ↔ Google, so this
 * function is handed whatever the client chose to post — the size limits and
 * the coercion below are the only thing between that and the `ai_interviews`
 * table.
 *
 * `learnerTurns` matters beyond storage: it decides whether an interview is
 * gradable at all, so a learner turn conjured out of a malformed entry would
 * put a score on an examination that never happened.
 */

const NAMES = { examiner: 'Hikaru', learner: 'Aron' };

test('keeps well-formed turns and counts only the learner’s', () => {
  const result = normalizeTranscript([
    { speaker: 'examiner', text: 'こんにちは。', at: 0 },
    { speaker: 'learner', text: 'こんにちは、よろしくお願いします。', at: 2100 },
    { speaker: 'examiner', text: '今日は何をしましたか。', at: 5000 },
    { speaker: 'learner', text: '大学に行きました。', at: 9000 },
  ]);

  assert.equal(result.turns.length, 4);
  assert.equal(result.learnerTurns, 2);
  assert.equal(result.truncated, false);
});

test('drops entries that are not turns rather than failing the submission', () => {
  const result = normalizeTranscript([
    null,
    'a bare string',
    { speaker: 'learner' },
    { speaker: 'learner', text: '   ' },
    { speaker: 'nobody', text: 'who said this?' },
    { speaker: 'learner', text: 'A real answer.', at: 10 },
  ]);

  // An interview is not worth losing over one malformed entry; but nothing
  // malformed may become a scoreable learner turn either.
  assert.equal(result.turns.length, 1);
  assert.equal(result.learnerTurns, 1);
  assert.equal(result.turns[0].text, 'A real answer.');
});

test('a non-array payload yields an empty transcript, not a throw', () => {
  for (const payload of [undefined, null, 42, 'text', { turns: [] }]) {
    const result = normalizeTranscript(payload);
    assert.deepEqual(result.turns, []);
    assert.equal(result.learnerTurns, 0);
  }
});

test('a broken clock does not discard the turn it stamped', () => {
  const result = normalizeTranscript([
    { speaker: 'learner', text: 'negative offset', at: -5 },
    { speaker: 'learner', text: 'not a number', at: 'soon' },
    { speaker: 'learner', text: 'fractional', at: 12.7 },
  ]);

  assert.equal(result.turns.length, 3);
  assert.deepEqual(result.turns.map((t) => t.at), [0, 0, 13]);
});

test('caps the number of turns and says that it did', () => {
  const many = Array.from({ length: MAX_TRANSCRIPT_TURNS + 50 }, (_, i) => ({
    speaker: 'learner' as const,
    text: `answer ${i}`,
    at: i,
  }));

  const result = normalizeTranscript(many);

  assert.equal(result.turns.length, MAX_TRANSCRIPT_TURNS);
  assert.equal(result.truncated, true);
  // The earliest turns are the ones kept — the opening of an examination is
  // what a grader needs, not its tail.
  assert.equal(result.turns[0].text, 'answer 0');
});

test('caps a single oversized turn without dropping it', () => {
  const result = normalizeTranscript([
    { speaker: 'learner', text: 'x'.repeat(MAX_TRANSCRIPT_TEXT_CHARS + 500), at: 0 },
  ]);

  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].text.length, MAX_TRANSCRIPT_TEXT_CHARS);
});

test('stops at the total character budget', () => {
  const chunk = 'y'.repeat(MAX_TRANSCRIPT_TEXT_CHARS);
  const turns = Array.from({ length: 40 }, (_, i) => ({
    speaker: 'learner' as const,
    text: chunk,
    at: i,
  }));

  const result = normalizeTranscript(turns);
  const total = result.turns.reduce((sum, t) => sum + t.text.length, 0);

  assert.ok(total <= MAX_TRANSCRIPT_TOTAL_CHARS);
  assert.equal(result.truncated, true);
  assert.ok(result.turns.length < 40);
});

test('round-trips through storage, and survives a corrupt column', () => {
  const stored = JSON.stringify(
    normalizeTranscript([
      { speaker: 'examiner', text: 'Question one.', at: 0 },
      { speaker: 'learner', text: 'Answer one.', at: 1000 },
    ]).turns,
  );

  assert.equal(parseStoredTranscript(stored).length, 2);
  assert.deepEqual(parseStoredTranscript(null), []);
  assert.deepEqual(parseStoredTranscript('not json at all'), []);
  assert.deepEqual(parseStoredTranscript('{"not":"an array"}'), []);
});

test('renders for the grading prompt with each side named', () => {
  const { turns } = normalizeTranscript([
    { speaker: 'examiner', text: 'Question one.', at: 0 },
    { speaker: 'learner', text: 'Answer one.', at: 1000 },
  ]);

  assert.equal(
    transcriptToText(turns, NAMES),
    'Hikaru: Question one.\nAron: Answer one.',
  );
});
