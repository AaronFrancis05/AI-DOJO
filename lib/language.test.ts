import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_NATIVE_LANGUAGES,
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
