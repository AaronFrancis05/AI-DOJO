import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_NATIVE_LANGUAGES,
  DEFAULT_TARGET_LANGUAGE,
  isRtlLanguage,
  matchAcceptLanguage,
  BUILT_IN_TARGET_LANGUAGES,
  NATIVE_LANGUAGES,
  TARGET_LANGUAGES,
  getAzureVoice,
  getBCP47,
  getGreetingGesture,
  getTargetLangConfig,
  hydrateLanguageCatalog,
  type LanguageConfig,
} from './language';

const KISWAHILI_UG: LanguageConfig = {
  code: 'sw-ug',
  name: 'Kiswahili (Uganda)',
  nativeName: 'Kiswahili',
  flag: '🇺🇬',
  bcp47: { stt: 'sw-KE', tts: 'sw-KE' },
  azureVoice: { female: 'sw-KE-ZuriNeural', male: 'sw-KE-RafikiNeural' },
  hasPhonetic: false,
  ttsSupported: true,
  greetingGesture: 'wave',
};

function restore() {
  hydrateLanguageCatalog(
    BUILT_IN_TARGET_LANGUAGES.map((l) => ({ ...l })),
    BUILT_IN_NATIVE_LANGUAGES.map((l) => ({ ...l })),
  );
}

test('the built-in snapshot is taken before anything can hydrate', () => {
  assert.ok(BUILT_IN_TARGET_LANGUAGES.length > 0);
  assert.ok(BUILT_IN_NATIVE_LANGUAGES.length > 0);
  assert.ok(BUILT_IN_TARGET_LANGUAGES.some((l) => l.code === 'ja'));
});

test('a hydrated language resolves through the synchronous lookups', () => {
  // This is the whole point of hydrating in place: ~50 call sites across
  // prompts, TTS and the UI keep calling these helpers unchanged, and an
  // admin-added language has to answer through every one of them.
  try {
    hydrateLanguageCatalog([...BUILT_IN_TARGET_LANGUAGES, KISWAHILI_UG], BUILT_IN_NATIVE_LANGUAGES);

    assert.equal(getTargetLangConfig('sw-ug').name, 'Kiswahili (Uganda)');
    assert.equal(getBCP47('sw-ug', 'tts'), 'sw-KE');
    assert.equal(getAzureVoice('sw-ug', 'male'), 'sw-KE-RafikiNeural');
    assert.equal(getGreetingGesture('sw-ug'), 'wave');
  } finally {
    restore();
  }
});

test('hydration replaces rather than appends', () => {
  try {
    hydrateLanguageCatalog([KISWAHILI_UG], [{ code: 'lg', name: 'Luganda', nativeName: 'Luganda' }]);

    assert.equal(TARGET_LANGUAGES.length, 1);
    assert.equal(NATIVE_LANGUAGES.length, 1);
    // A language an admin disabled must actually stop resolving, not linger.
    assert.notEqual(getTargetLangConfig('ja').code, 'ja');
  } finally {
    restore();
  }
});

test('the exported arrays are mutated in place, so captured bindings stay live', () => {
  const captured = TARGET_LANGUAGES;
  try {
    hydrateLanguageCatalog([KISWAHILI_UG], BUILT_IN_NATIVE_LANGUAGES);
    assert.equal(captured[0].code, 'sw-ug');
    assert.equal(captured, TARGET_LANGUAGES);
  } finally {
    restore();
  }
});

test('an empty catalogue is refused, because it would take down every prompt', () => {
  try {
    hydrateLanguageCatalog([], []);
    assert.ok(TARGET_LANGUAGES.length > 0, 'target catalogue must never be emptied');
    assert.ok(NATIVE_LANGUAGES.length > 0, 'native catalogue must never be emptied');
    assert.equal(getTargetLangConfig('ja').code, 'ja');
  } finally {
    restore();
  }
});

test('an unknown code still falls back to the first target language', () => {
  restore();
  // Long-standing behaviour that prompts and TTS depend on: never undefined.
  assert.ok(getTargetLangConfig('definitely-not-a-language').code.length > 0);
});

test('an unknown code falls back to the default target language, English', () => {
  restore();
  assert.equal(DEFAULT_TARGET_LANGUAGE, 'en');
  assert.equal(getTargetLangConfig('definitely-not-a-language').code, 'en');
});

test('Accept-Language picks the highest-ranked supported primary subtag', () => {
  const supported = ['en', 'ja', 'pt', 'zh', 'tl'];
  assert.equal(matchAcceptLanguage('ja-JP,ja;q=0.9,en-US;q=0.8', supported), 'ja');
  assert.equal(matchAcceptLanguage('pt-BR', supported), 'pt');
  assert.equal(matchAcceptLanguage('zh-Hant-TW,en;q=0.5', supported), 'zh');
  assert.equal(matchAcceptLanguage('de;q=1, en;q=0.4', supported), 'en');
  assert.equal(matchAcceptLanguage('en;q=0.2, ja;q=0.8', supported), 'ja');
  assert.equal(matchAcceptLanguage('fil-PH', supported), 'tl');
});

test('Accept-Language with nothing supported, q=0 or a wildcard returns null', () => {
  assert.equal(matchAcceptLanguage('de-DE,fr;q=0.9', ['en', 'ja']), null);
  assert.equal(matchAcceptLanguage('ja;q=0', ['ja']), null);
  assert.equal(matchAcceptLanguage('*', ['en']), null);
  assert.equal(matchAcceptLanguage(null, ['en']), null);
});

test('right-to-left scripts are detected by code, region subtags included', () => {
  for (const code of ['ar', 'he', 'fa', 'ur', 'ar-EG']) assert.equal(isRtlLanguage(code), true, code);
  for (const code of ['en', 'ja', 'sw', '', null]) assert.equal(isRtlLanguage(code), false, String(code));
});
