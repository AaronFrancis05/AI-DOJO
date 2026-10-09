import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePronunciationWords, weakPhonemes } from './pronunciation-detail';

// Shape of Azure's NBest[0] detail at Phoneme granularity (trimmed).
const detail = {
  Words: [
    {
      Word: 'right',
      PronunciationAssessment: { AccuracyScore: 41, ErrorType: 'Mispronunciation' },
      Phonemes: [
        { Phoneme: 'r', PronunciationAssessment: { AccuracyScore: 12 } },
        { Phoneme: 'ay', PronunciationAssessment: { AccuracyScore: 95 } },
        { Phoneme: 't', PronunciationAssessment: { AccuracyScore: 88 } },
      ],
    },
    {
      Word: 'rice',
      PronunciationAssessment: { AccuracyScore: 55, ErrorType: 'Mispronunciation' },
      Phonemes: [
        { Phoneme: 'r', PronunciationAssessment: { AccuracyScore: 30 } },
        { Phoneme: 'ay', PronunciationAssessment: { AccuracyScore: 90 } },
        { Phoneme: 's', PronunciationAssessment: { AccuracyScore: 50 } },
      ],
    },
  ],
};

test('keeps every word with its phonemes and scores', () => {
  const words = parsePronunciationWords(detail);
  assert.equal(words.length, 2);
  assert.deepEqual(words[0], {
    word: 'right',
    accuracyScore: 41,
    errorType: 'Mispronunciation',
    phonemes: [
      { phoneme: 'r', accuracyScore: 12 },
      { phoneme: 'ay', accuracyScore: 95 },
      { phoneme: 't', accuracyScore: 88 },
    ],
  });
});

test('weak phonemes are grouped, averaged and worst first', () => {
  assert.deepEqual(weakPhonemes(parsePronunciationWords(detail)), [
    { phoneme: 'r', averageScore: 21, words: ['right', 'rice'] },
    { phoneme: 's', averageScore: 50, words: ['rice'] },
  ]);
});

test('malformed or missing detail yields an empty result, never a throw', () => {
  assert.deepEqual(parsePronunciationWords(undefined), []);
  assert.deepEqual(parsePronunciationWords({ Words: 'nope' }), []);
  assert.deepEqual(parsePronunciationWords({ Words: [{ Word: 'a' }] }), [
    { word: 'a', accuracyScore: null, errorType: 'None', phonemes: [] },
  ]);
});
