import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConversationHistory,
  displayedUtterance,
  persistableUserUtterance,
} from './conversation-history';

test('learner bubble falls back to the full utterance when no target-language spans exist', () => {
  assert.equal(
    displayedUtterance({ speaker: 'user', messageTarget: '', messageNative: 'Hello there' }),
    'Hello there',
  );
});

test('learner bubble prefers target-language spans when they exist', () => {
  assert.equal(
    displayedUtterance({ speaker: 'user', messageTarget: 'こんにちは', messageNative: 'Hello' }),
    'こんにちは',
  );
});

test('AI bubble does not fall through an empty target to native', () => {
  assert.equal(
    displayedUtterance({ speaker: 'ai', messageTarget: '', messageNative: 'should not show' }),
    '',
  );
});

test('persistable user utterance keeps raw input when analysis native is empty', () => {
  assert.deepEqual(
    persistableUserUtterance({ messageTarget: '', messageNative: '' }, '  Hello  '),
    { messageTarget: '', messageNative: 'Hello' },
  );
});

test('history uses the same learner fallback so the model still sees English-only turns', () => {
  const history = buildConversationHistory([
    { speaker: 'user', messageTarget: '', messageNative: 'Hello' },
    { speaker: 'ai', messageTarget: 'Hi!', messageNative: '' },
  ]);
  assert.deepEqual(history, [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi!' },
  ]);
});
