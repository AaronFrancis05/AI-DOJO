import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferGesture } from './gesture';

test('a Japanese greeting bows', () => {
  assert.equal(inferGesture('こんにちは！日本語の練習をしましょう。', 'ja'), 'bow');
  assert.equal(inferGesture('はじめまして。田中です。', 'ja'), 'bow');
});

test('Japanese thanks and apologies bow too', () => {
  assert.equal(inferGesture('ありがとうございます。', 'ja'), 'bow');
  assert.equal(inferGesture('申し訳ありません。', 'ja'), 'bow');
});

test('a French greeting waves rather than bowing', () => {
  assert.equal(inferGesture('Bonjour ! Bienvenue au centre.', 'fr'), 'wave');
  assert.equal(inferGesture('Merci beaucoup.', 'fr'), 'wave');
});

test('matching is case-insensitive', () => {
  assert.equal(inferGesture('BONJOUR, Aaron.', 'fr'), 'wave');
});

test('an ordinary line gestures with nothing, leaving the model in charge', () => {
  assert.equal(inferGesture('Je viens d’Ouganda et j’étudie ici.', 'fr'), 'none');
  assert.equal(inferGesture('今日は暑いですね。', 'ja'), 'none');
});

test('a language with no term list never guesses', () => {
  assert.equal(inferGesture('Habari yako', 'xx'), 'none');
  assert.equal(inferGesture('', 'ja'), 'none');
});

test('Korean and Thai bow; Swahili waves', () => {
  assert.equal(inferGesture('안녕하세요!', 'ko'), 'bow');
  assert.equal(inferGesture('สวัสดีครับ', 'th'), 'bow');
  assert.equal(inferGesture('Karibu sana!', 'sw'), 'wave');
});
