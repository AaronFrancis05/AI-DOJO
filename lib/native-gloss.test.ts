import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNativeGloss } from './native-gloss';

/**
 * The seeded vocabulary rows are Japanese words with English meanings, so the
 * meaning a learner sees must come from a different column depending on the
 * language they speak — never from the English column for everyone.
 */

const konbini = { targetText: 'コンビニ', translation: 'convenience store', languageCode: 'ja' };

test('a Japanese speaker gets the base word itself as the meaning', () => {
  assert.equal(resolveNativeGloss(konbini, 'ja', undefined), 'コンビニ');
});

test('an English speaker gets the base English meaning', () => {
  assert.equal(resolveNativeGloss(konbini, 'en', { translation: 'ignored' }), 'convenience store');
});

test('any other speaker gets the word in their own language', () => {
  assert.equal(resolveNativeGloss(konbini, 'fr', { translation: 'supérette' }), 'supérette');
});

test('a missing localization returns null so the caller keeps English and logs', () => {
  assert.equal(resolveNativeGloss(konbini, 'fr', undefined), null);
  assert.equal(resolveNativeGloss(konbini, 'fr', { translation: null }), null);
});

test('a row generated in another language glosses from its own language', () => {
  const generated = { targetText: 'boulangerie', translation: 'bakery', languageCode: 'fr' };
  assert.equal(resolveNativeGloss(generated, 'fr', undefined), 'boulangerie');
});

test('an English-authored row gives English speakers its definition, not the word', () => {
  const authored = { targetText: 'shortlist', translation: 'a final list of candidates', languageCode: 'en' };
  assert.equal(resolveNativeGloss(authored, 'en', undefined), 'a final list of candidates');
  assert.equal(resolveNativeGloss(authored, 'ja', { translation: '最終候補者リスト' }), '最終候補者リスト');
});
