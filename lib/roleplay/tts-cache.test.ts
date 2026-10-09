import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  concatPcmChunks,
  createTtsTurnCache,
  normalizeTtsCacheKey,
} from './tts-cache';

test('normalizes cache keys by collapsing whitespace', () => {
  assert.equal(normalizeTtsCacheKey('  hello   there\n'), 'hello there');
});

test('concatenates PCM chunks in order without sharing the source buffers', () => {
  const a = new Uint8Array([1, 2]).buffer;
  const b = new Uint8Array([3, 4, 5]).buffer;
  const joined = new Uint8Array(concatPcmChunks([a, b]));
  assert.deepEqual([...joined], [1, 2, 3, 4, 5]);
  new Uint8Array(a)[0] = 9;
  assert.equal(joined[0], 1);
});

test('commit stores a finished turn and get retrieves it', () => {
  const cache = createTtsTurnCache();
  const pcm = new Uint8Array([1, 0]).buffer;
  cache.start();
  cache.pushClip(pcm, [{ id: 4, offsetMs: 12 }]);
  cache.commit('Hello there');

  const clips = cache.get('  Hello   there  ');
  assert.equal(clips?.length, 1);
  assert.equal(clips?.[0]?.visemes[0]?.id, 4);
  assert.equal(new Uint8Array(clips![0].pcm)[0], 1);
});

test('discard prevents an interrupted turn from being stored', () => {
  const cache = createTtsTurnCache();
  cache.start();
  cache.pushClip(new Uint8Array([1, 0]).buffer, []);
  cache.discard();
  cache.commit('Hello');
  assert.equal(cache.get('Hello'), undefined);
});

test('commit of an empty capture is a no-op', () => {
  const cache = createTtsTurnCache();
  cache.start();
  cache.commit('Hello');
  assert.equal(cache.get('Hello'), undefined);
});

test('pushClip is ignored when not capturing', () => {
  const cache = createTtsTurnCache();
  cache.pushClip(new Uint8Array([1, 0]).buffer, []);
  cache.commit('Hello');
  assert.equal(cache.get('Hello'), undefined);
});

test('out-of-order fills still replay in reserve order', () => {
  const cache = createTtsTurnCache();
  cache.start();
  const first = cache.reserve();
  const second = cache.reserve();
  cache.fill(second, new Uint8Array([2, 0]).buffer, []);
  cache.fill(first, new Uint8Array([1, 0]).buffer, []);
  cache.commit('Turn');

  const clips = cache.get('Turn');
  assert.equal(clips?.length, 2);
  assert.equal(new Uint8Array(clips![0].pcm)[0], 1);
  assert.equal(new Uint8Array(clips![1].pcm)[0], 2);
});

test('unfilled reserved slots are dropped on commit', () => {
  const cache = createTtsTurnCache();
  cache.start();
  cache.reserve();
  cache.fill(cache.reserve(), new Uint8Array([9, 0]).buffer, []);
  cache.commit('Turn');

  const clips = cache.get('Turn');
  assert.equal(clips?.length, 1);
  assert.equal(new Uint8Array(clips![0].pcm)[0], 9);
});

test('clear drops stored turns and any in-progress capture', () => {
  const cache = createTtsTurnCache();
  cache.start();
  cache.pushClip(new Uint8Array([1, 0]).buffer, []);
  cache.commit('Hello');
  cache.start();
  cache.pushClip(new Uint8Array([2, 0]).buffer, []);
  cache.clear();
  assert.equal(cache.get('Hello'), undefined);
  cache.commit('Later');
  assert.equal(cache.get('Later'), undefined);
});
