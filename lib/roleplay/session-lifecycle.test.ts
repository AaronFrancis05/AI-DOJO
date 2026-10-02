import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSessionClock,
  isAbandonmentReason,
  isSessionEnded,
  isSessionPlayView,
  isSessionPlayable,
} from './session-lifecycle';

test('playable statuses are only active and paused', () => {
  assert.equal(isSessionPlayable('active'), true);
  assert.equal(isSessionPlayable('paused'), true);
  assert.equal(isSessionPlayable('completed'), false);
  assert.equal(isSessionPlayable('abandoned'), false);
});

test('ended statuses are completed (scored finish) and abandoned (quit)', () => {
  assert.equal(isSessionEnded('completed'), true);
  assert.equal(isSessionEnded('abandoned'), true);
  assert.equal(isSessionEnded('active'), false);
  assert.equal(isSessionEnded('paused'), false);
});

test('abandonment reasons are the preset ids only', () => {
  assert.equal(isAbandonmentReason('too_difficult'), true);
  assert.equal(isAbandonmentReason('other'), true);
  assert.equal(isAbandonmentReason('gave_up'), false);
  assert.equal(isAbandonmentReason(''), false);
});

test('session clock formats as mm:ss from accumulated seconds', () => {
  assert.equal(formatSessionClock(0), '00:00');
  assert.equal(formatSessionClock(5), '00:05');
  assert.equal(formatSessionClock(75), '01:15');
  assert.equal(formatSessionClock(-3), '00:00');
});

test('play views are voice and avatar, not the chooser', () => {
  assert.equal(isSessionPlayView('/session/12/voice'), true);
  assert.equal(isSessionPlayView('/session/12/avatar'), true);
  assert.equal(isSessionPlayView('/session/12'), false);
  assert.equal(isSessionPlayView('/sessions/12/report'), false);
});
