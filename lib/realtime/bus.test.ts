import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpstashFrame } from './bus';
import { topics } from './topics';

/**
 * The realtime fan-out reads Upstash's pub/sub SSE stream, whose frame format
 * is documented nowhere in a type — it was read off the live stream:
 *
 *   data: subscribe,{channel},{subscriber count}
 *   data: message,{channel},{payload}
 *
 * These assert the parts that would fail silently if they were wrong. A
 * mis-parsed frame does not throw; it just means a message never arrives, and
 * the safety-net reconciliation quietly covers for it — so a bug here would
 * look like "chat is a bit slow" rather than like a failure.
 */

function frame(channel: string, payload: unknown): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return `data: message,${channel},${encoded}`;
}

test('parses a message frame into its topic and event', () => {
  const event = { type: 'chat.message', roomId: 12, messageId: 88, senderId: 'u1' };
  const parsed = parseUpstashFrame(frame(topics.chatRoom(12), event));

  assert.ok(parsed);
  assert.equal(parsed.topic, 'chat:12');
  assert.deepEqual(parsed.event, event);
});

test('ignores the subscribe acknowledgement Upstash sends on connect', () => {
  // Delivered on every connection before any real message. Treating it as one
  // would hand the client an event with no `type`.
  assert.equal(parseUpstashFrame('data: subscribe,chat:12,1'), null);
});

test('a payload containing commas and newlines survives the round trip', () => {
  // The reason payloads are base64 rather than raw JSON: a comma would split
  // the frame at the wrong place, and a newline would end it early.
  const event = {
    type: 'notification',
    notificationId: 5,
    note: 'a,b\nc "d"',
  };
  const parsed = parseUpstashFrame(frame('user:abc', event));

  assert.ok(parsed);
  assert.deepEqual(parsed.event, event);
});

test('a topic id containing a colon is not truncated', () => {
  // User ids come from the auth provider and are not guaranteed colon-free.
  // Splitting the frame on every comma is fine; splitting a TOPIC on every
  // colon is not, which is why authorize.ts splits on the first one only.
  const parsed = parseUpstashFrame(frame('user:abc:def', { type: 'notification', notificationId: 1 }));
  assert.ok(parsed);
  assert.equal(parsed.topic, 'user:abc:def');
});

test('malformed frames are dropped rather than thrown', () => {
  assert.equal(parseUpstashFrame(''), null);
  assert.equal(parseUpstashFrame(': ping'), null);
  assert.equal(parseUpstashFrame('data: message,chat:12'), null);
  assert.equal(parseUpstashFrame('data: message,chat:12,not-base64-json'), null);
  // Valid base64, valid JSON, but not an event — no `type`.
  const noType = Buffer.from(JSON.stringify({ roomId: 1 }), 'utf8').toString('base64');
  assert.equal(parseUpstashFrame(`data: message,chat:12,${noType}`), null);
});

test('topic builders produce the strings the authorizer parses', () => {
  assert.equal(topics.chatRoom(12), 'chat:12');
  assert.equal(topics.user('abc'), 'user:abc');
  assert.equal(topics.assessment(3), 'assessment:3');
  assert.equal(topics.classSession(4), 'class:4');
});
