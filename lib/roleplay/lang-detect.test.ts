import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpeechSpans, splitIntoLangSpans } from './lang-detect';

test('splitIntoLangSpans labels unmarked text as native', () => {
  const spans = splitIntoLangSpans('こんにちは。さあ、言ってみましょう！');
  assert.deepEqual(spans, [{ text: 'こんにちは。さあ、言ってみましょう！', lang: 'native' }]);
});

test('undelimited Japanese tryout reply is spoken as the target, not native', () => {
  const spans = resolveSpeechSpans(
    '最初のフレーズは「はじめまして」です。さあ、言ってみましょう！',
    'ja-JP',
    'en-US',
  );
  assert.equal(spans.length, 1);
  assert.equal(spans[0].lang, 'target');
});

test('English gloss inside a Japanese teaching line uses the native voice', () => {
  const text = 'こんにちは！初めての日本語、素晴らしいスタートですね！最初のフレーズは「はじめまして」です。これは英語の「Nice to meet you」と同じ意味ですよ。さあ、一緒に言ってみましょうか？「はじめまして」！';
  const spans = resolveSpeechSpans(text, 'ja-JP', 'en-US');
  const native = spans.filter((s) => s.lang === 'native');
  assert.equal(native.length, 1);
  assert.match(native[0].text, /Nice to meet you/);
  assert.ok(spans.some((s) => s.lang === 'target' && s.text.includes('はじめまして')));
});

test('short Latin tokens stay on the Japanese voice', () => {
  const spans = resolveSpeechSpans('OK、もう一度言ってみましょう。', 'ja-JP', 'en-US');
  assert.equal(spans.length, 1);
  assert.equal(spans[0].lang, 'target');
});

test('delimited session mixed line still splits target vs native', () => {
  const spans = resolveSpeechSpans('That means hello. ⟦こんにちは⟧ Try it.', 'ja-JP', 'en-US');
  assert.deepEqual(
    spans.map((s) => s.lang),
    ['native', 'target', 'native'],
  );
});

test('undelimited Latin-script target is spoken as target', () => {
  const spans = resolveSpeechSpans('Bonjour ! Essayez de le dire.', 'fr-FR', 'en-US');
  assert.equal(spans[0].lang, 'target');
});

test('CJK target with no target script falls back to native', () => {
  const spans = resolveSpeechSpans('Nice to meet you. Try saying it!', 'ja-JP', 'en-US');
  assert.equal(spans[0].lang, 'native');
});
