import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStreamedChunk, parseVocabMarker, createStreamTextSanitizer } from './stream-sanitizer';

/**
 * Everything here is scaffolding the learner both READS in the transcript and
 * HEARS, because the sanitized reply is what gets handed to TTS. The two
 * shapes asserted below are the ones that actually shipped: 【VOCAB N2】 (the
 * model writing the prompt's placeholder "N" through alongside the digit) and
 * the bracketed stage labels it echoes out of the phase prompt's headings.
 */

test('strips the vocab marker in every shape the model emits', () => {
  assert.equal(sanitizeStreamedChunk('【VOCAB N2】 Next, we have ⟦"つくえ"⟧').trim(), 'Next, we have ⟦"つくえ"⟧');
  assert.equal(sanitizeStreamedChunk('【VOCAB 2】 Next').trim(), 'Next');
  assert.equal(sanitizeStreamedChunk('[VOCAB #2] Next').trim(), 'Next');
  assert.equal(sanitizeStreamedChunk('【VOCAB N】 Next').trim(), 'Next');
});

test('strips bracketed stage labels', () => {
  assert.equal(
    sanitizeStreamedChunk('[COACHING] Don\'t worry. [SCENE CONTINUES] "Welcome, Aaron!"'),
    'Don\'t worry. "Welcome, Aaron!"',
  );
  assert.equal(sanitizeStreamedChunk('[SCENE START] Come in.'), 'Come in.');
  assert.equal(sanitizeStreamedChunk('[SCENE END] See you tomorrow.'), 'See you tomorrow.');
});

test('leaves learner-facing text alone', () => {
  // Japanese quotation marks are content, not the 【VOCAB N】 marker.
  const line = 'はじめまして。「こんにちは」と言います。';
  assert.equal(sanitizeStreamedChunk(line), line);
  // A bracketed token carrying digits is not a stage label.
  assert.equal(sanitizeStreamedChunk('Level [JLPT N5] is fine.'), 'Level [JLPT N5] is fine.');
  // Neither is a lowercase one.
  assert.equal(sanitizeStreamedChunk('She said "OK" [nod] and left.'), 'She said "OK" [nod] and left.');
});

test('parses the word number out of any marker shape', () => {
  assert.equal(parseVocabMarker('【VOCAB N2】 Next'), 2);
  assert.equal(parseVocabMarker('【VOCAB 2】 Next'), 2);
  assert.equal(parseVocabMarker('[VOCAB #3] Next'), 3);
  // No digit at all, and no marker at all, are both "the model told us nothing".
  assert.equal(parseVocabMarker('【VOCAB N】 Next'), null);
  assert.equal(parseVocabMarker('Next word please'), null);
});

test('holds back a marker split across chunk boundaries', () => {
  const sanitizer = createStreamTextSanitizer();
  // The provider splits 【VOCAB N2】 mid-marker; nothing may leak in between.
  assert.equal(sanitizer.push('Good job! 【VOC'), 'Good job! ');
  assert.equal(sanitizer.push('AB N2】 Now'), 'Now');
  assert.equal(sanitizer.flush(), '');
});
