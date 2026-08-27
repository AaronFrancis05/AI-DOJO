import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSentenceEnd, insideSpan } from './sentence-split';

/**
 * The streaming speaker splits the model's reply into sentences so the first
 * one can be synthesized while the rest is still being written. These assert
 * the one thing that split must never do.
 */

test('splits on a sentence terminator followed by whitespace', () => {
  const buffer = 'Bonjour. Comment allez-vous';
  assert.equal(findSentenceEnd(buffer, false), 'Bonjour.'.length);
});

test('does not treat the end of the buffer as a boundary while streaming', () => {
  // "Mr." at the end of the buffer is a chunk boundary, not a sentence end.
  assert.equal(findSentenceEnd('Bonjour Mr.', false), -1);
  // Once generation is over, the same text really does end there.
  assert.equal(findSentenceEnd('Bonjour Mr.', true), 'Bonjour Mr.'.length);
});

test('never splits inside a ⟦ ⟧ span', () => {
  // The fragment "⟦Bonjour !" has an opening delimiter with no partner, so it
  // would be classified as native text and spoken in the learner's own voice.
  // The span's internal terminators are skipped, so the chunk runs on to the
  // next boundary outside it and stays balanced.
  const buffer = '⟦Bonjour ! Enchanté.⟧ Cela veut dire "hello". Essayez';
  const end = findSentenceEnd(buffer, false);
  const chunk = buffer.slice(0, end);
  assert.equal(chunk, '⟦Bonjour ! Enchanté.⟧ Cela veut dire "hello".');
  assert.equal(insideSpan(chunk, chunk.length), false);
});

test('waits for the closing delimiter rather than speaking half a span', () => {
  assert.equal(findSentenceEnd('⟦Bonjour ! Encha', false), -1);
});

test('a newline inside a span is not a boundary either', () => {
  assert.equal(findSentenceEnd('⟦Bonjour\nEnchanté', false), -1);
});

test('splits before a span that has not been closed yet', () => {
  const buffer = 'Voici le mot. ⟦Bonjour ! Encha';
  const end = findSentenceEnd(buffer, false);
  assert.equal(buffer.slice(0, end), 'Voici le mot.');
});

test('handles Japanese terminators, keeping the span whole', () => {
  const buffer = '⟦こんにちは。⟧ これは挨拶です。 言ってみましょう';
  const end = findSentenceEnd(buffer, false);
  assert.equal(buffer.slice(0, end), '⟦こんにちは。⟧ これは挨拶です。');
});

test('the last sentence of a finished reply is emitted without trailing space', () => {
  // Same text the streaming pass declined to split — flushStreamTts runs the
  // final pattern precisely so nothing is left unsaid.
  const buffer = '⟦Bonjour ! Enchanté.⟧ Cela veut dire "hello".';
  assert.equal(findSentenceEnd(buffer, false), -1);
  assert.equal(findSentenceEnd(buffer, true), buffer.length);
});

test('insideSpan tracks open and closed delimiters', () => {
  const buffer = '⟦a⟧ b ⟦c';
  assert.equal(insideSpan(buffer, 1), true);   // just after ⟦
  assert.equal(insideSpan(buffer, 3), false);  // just after ⟧
  assert.equal(insideSpan(buffer, buffer.length), true);
});
