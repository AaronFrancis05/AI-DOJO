import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryFromHeaders, resolveUiLocale } from './config';
import { compareCatalogs, createTranslator, flattenMessages, mergeMessages, unflattenMessages } from './messages';

const supported = ['en', 'ja', 'fr', 'de', 'ar', 'hi'];
const base = { cookie: null, profileNative: null, countryLanguage: null, acceptLanguage: null, supported };

test('an explicit switcher choice outranks the profile and every guess', () => {
  const r = resolveUiLocale({ ...base, cookie: 'en', profileNative: 'ja', countryLanguage: 'ja', acceptLanguage: 'ja' });
  assert.deepEqual(r, { locale: 'en', source: 'cookie', dir: 'ltr' });
});

test('a signed-in user gets their native language', () => {
  assert.equal(resolveUiLocale({ ...base, profileNative: 'ja', acceptLanguage: 'en-US' }).locale, 'ja');
});

test('a first visit from Japan with an English device default is shown in Japanese', () => {
  const r = resolveUiLocale({ ...base, countryLanguage: 'ja', acceptLanguage: 'en-US,en;q=0.9' });
  assert.deepEqual(r, { locale: 'ja', source: 'country', dir: 'ltr' });
});

test('a non-English browser decides inside a multilingual country', () => {
  // A French-speaking visitor in Switzerland, whose country default is German.
  assert.equal(resolveUiLocale({ ...base, countryLanguage: 'de', acceptLanguage: 'fr-CH,fr;q=0.9' }).locale, 'fr');
});

test('Arabic resolves right-to-left; unsupported values are skipped, not trusted', () => {
  assert.equal(resolveUiLocale({ ...base, acceptLanguage: 'ar-EG' }).dir, 'rtl');
  assert.deepEqual(resolveUiLocale({ ...base, cookie: 'xx', profileNative: 'zz' }), { locale: 'en', source: 'default', dir: 'ltr' });
});

test('country headers are read in platform order and junk is ignored', () => {
  const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;
  assert.equal(countryFromHeaders(headers({ 'x-vercel-ip-country': 'jp' })), 'JP');
  assert.equal(countryFromHeaders(headers({ 'cf-ipcountry': 'XX', 'x-country-code': 'KR' })), 'KR');
  assert.equal(countryFromHeaders(headers({ 'cf-ipcountry': 'T1' })), null);
  assert.equal(countryFromHeaders(headers({ 'cf-ipcountry': 'Japan' })), null);
});

const en = { nav: { home: 'Home', level: 'Level {level}' }, common: { save: 'Save' } };

test('translation interpolates and falls back to the key, never blank', () => {
  const t = createTranslator(en);
  assert.equal(t('nav.level', { level: 3 }), 'Level 3');
  assert.equal(t('nav.missing'), 'nav.missing');
  assert.equal(t('nav.level'), 'Level {level}');
});

test('a partial catalog shows English only for what it lacks, and drops stale keys', () => {
  const ja = { nav: { home: 'ホーム', old: '古い' } };
  assert.deepEqual(mergeMessages(en, ja), { nav: { home: 'ホーム', level: 'Level {level}' }, common: { save: 'Save' } });
});

test('flatten and unflatten round-trip', () => {
  assert.deepEqual(unflattenMessages(flattenMessages(en)), en);
});

test('catalog comparison reports missing, stray and placeholder-changing keys', () => {
  const fr = { nav: { home: 'Accueil', level: 'Niveau {niveau}', extra: 'x' } };
  assert.deepEqual(compareCatalogs(en, fr), {
    missing: ['common.save'],
    extra: ['nav.extra'],
    placeholderMismatch: ['nav.level'],
  });
});
