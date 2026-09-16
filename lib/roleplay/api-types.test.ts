import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isChatStreamEvent,
  isSessionDetailResponse,
  isSharedSessionResponse,
} from './api-types';

test('accepts a well-formed chat stream event', () => {
  assert.equal(isChatStreamEvent({ type: 'token', text: 'こんにちは' }), true);
  assert.equal(isChatStreamEvent({
    type: 'done',
    phase: 'guided',
    analysis: { corrections: [], suggestedReplies: [] },
  }), true);
});

test('rejects malformed chat stream events before property access', () => {
  assert.equal(isChatStreamEvent({ type: 'token', text: 42 }), false);
  assert.equal(isChatStreamEvent({
    type: 'retry',
    analysis: { corrections: 'not-an-array', suggestedReplies: [] },
  }), false);
  assert.equal(isChatStreamEvent(null), false);
});

test('recognises the required session response boundaries', () => {
  assert.equal(isSessionDetailResponse({
    success: true,
    session: { id: 7, status: 'active' },
    goals: [],
    conversations: [],
    goalCompletions: [],
    vocabulary: [],
  }), true);
  assert.equal(isSessionDetailResponse({
    success: true,
    session: { id: '7', status: 'active' },
    goals: [],
    conversations: [],
    goalCompletions: [],
    vocabulary: [],
  }), false);
});

test('recognises the required public-share response boundaries', () => {
  assert.equal(isSharedSessionResponse({
    success: true,
    readOnly: true,
    session: { id: 7 },
    scenario: { title: 'At the station' },
    conversations: [],
    goalCompletions: [],
  }), true);
  assert.equal(isSharedSessionResponse({
    success: true,
    readOnly: false,
    session: { id: 7 },
    scenario: { title: 'At the station' },
    conversations: [],
    goalCompletions: [],
  }), false);
});
