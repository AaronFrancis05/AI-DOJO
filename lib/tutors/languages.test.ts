import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLanguageCodes,
  serializeLanguageCodes,
  tutorLanguageError,
  tutorLanguageSets,
} from './languages';

const POLYGLOT = { languages: 'ja,fr,de', instructionLanguages: 'en,lg,sw' };

test('parses the stored comma-separated form', () => {
  assert.deepEqual(parseLanguageCodes('ja,fr,en'), ['ja', 'fr', 'en']);
});

test('parses the JSON array form a form posts', () => {
  assert.deepEqual(parseLanguageCodes(['ja', 'fr']), ['ja', 'fr']);
});

test('trims, drops blanks, and de-duplicates', () => {
  // A hand-edited column can hold ' ja , , fr ,ja'. Every one of those has been
  // seen in a comma-separated column at some point; none should reach a query.
  assert.deepEqual(parseLanguageCodes(' ja , , fr ,ja'), ['ja', 'fr']);
});

test('an absent column is an empty set, not a crash', () => {
  assert.deepEqual(parseLanguageCodes(null), []);
  assert.deepEqual(parseLanguageCodes(undefined), []);
  assert.deepEqual(parseLanguageCodes(42), []);
});

test('round-trips through the stored form', () => {
  const codes = ['ja', 'lg', 'sw'];
  assert.deepEqual(parseLanguageCodes(serializeLanguageCodes(codes)), codes);
});

test('keeps the two sets apart', () => {
  const sets = tutorLanguageSets({ languages: 'ja,fr', instructionLanguages: 'en,lg' });
  assert.deepEqual(sets.teaches, ['ja', 'fr']);
  assert.deepEqual(sets.explainsIn, ['en', 'lg']);
});

test('a profile with no instruction languages falls back to what it teaches', () => {
  // Pre-dates the column and missed the backfill. An empty "Explained in" list
  // would block the tutor from scheduling at all, which is the worse failure.
  const sets = tutorLanguageSets({ languages: 'ja,fr', instructionLanguages: null });
  assert.deepEqual(sets.explainsIn, ['ja', 'fr']);
});

test('an empty string is treated as absent, not as one blank code', () => {
  const sets = tutorLanguageSets({ languages: 'ja', instructionLanguages: '' });
  assert.deepEqual(sets.explainsIn, ['ja']);
});

test('a pair the tutor holds is allowed', () => {
  assert.equal(tutorLanguageError(POLYGLOT, 'ja', 'lg'), null);
  assert.equal(tutorLanguageError(POLYGLOT, 'de', 'sw'), null);
});

test('a language they do not teach is refused, and named', () => {
  // Before this check existed, `targetLanguage` was only tested for being
  // non-empty, so a tutor could schedule a Russian class without teaching it.
  const err = tutorLanguageError(POLYGLOT, 'ru', 'en');
  assert.ok(err, 'expected an error');
  assert.match(err, /ru/);
});

test('a language they cannot explain in is refused separately', () => {
  const err = tutorLanguageError(POLYGLOT, 'ja', 'fr');
  assert.ok(err, 'expected an error');
  assert.match(err, /fr/);
  assert.match(err, /explaining/);
});

test('teaching and explaining are independent sets', () => {
  // 'fr' is taught but not explained in; 'en' is explained in but not taught.
  assert.equal(tutorLanguageError(POLYGLOT, 'fr', 'en'), null);
  assert.ok(tutorLanguageError(POLYGLOT, 'en', 'en'), 'en is not a language they teach');
});

test('no instruction language is allowed — that is the pre-existing behaviour', () => {
  // Null means each learner reads in their own native language, which is what
  // every class did before the column existed.
  assert.equal(tutorLanguageError(POLYGLOT, 'ja', null), null);
});
