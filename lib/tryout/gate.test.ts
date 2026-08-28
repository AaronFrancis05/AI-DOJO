import { test } from 'node:test';
import assert from 'node:assert/strict';

// The gate signs with TRYOUT_COOKIE_SECRET or, failing that, the auth cookie
// secret. Set before any test body runs; `secret()` is read lazily per call.
process.env.TRYOUT_COOKIE_SECRET ||= 'test-tryout-secret';

const {
  checkTryoutGate,
  clientIp,
  issueSessionCookieValue,
  issueUsedCookieValue,
  readSessionCookieValue,
  readUsedCookieValue,
} = await import('./gate');

const DAY_MS = 24 * 60 * 60 * 1000;

test('a signed cookie round-trips its completion timestamp', () => {
  const now = 1_700_000_000_000;
  const value = issueUsedCookieValue(now);
  assert.equal(readUsedCookieValue(value), now);
});

test('a forged or edited cookie is rejected, not trusted', () => {
  const now = Date.now();
  const value = issueUsedCookieValue(now);
  const [, mac] = value.split('.');

  // Backdating the payload to escape the window is the obvious attack.
  assert.equal(readUsedCookieValue(`${now - DAY_MS}.${mac}`), null);
  // A signature of the right shape but the wrong content.
  assert.equal(readUsedCookieValue(`${now}.${'0'.repeat(mac.length)}`), null);
  // A signature of the wrong length must not throw out of timingSafeEqual.
  assert.equal(readUsedCookieValue(`${now}.abc`), null);
  assert.equal(readUsedCookieValue(String(now)), null);
  assert.equal(readUsedCookieValue(undefined), null);
  assert.equal(readUsedCookieValue(''), null);
});

test('a guest with no cookie is not blocked', async () => {
  const gate = await checkTryoutGate(undefined, '203.0.113.1');
  assert.equal(gate.blocked, false);
});

test('a fresh completion blocks, and reports the time left', async () => {
  const gate = await checkTryoutGate(issueUsedCookieValue(), '203.0.113.2');
  assert.equal(gate.blocked, true);
  assert.equal(gate.reason, 'device');
  assert.ok(gate.retryAfterMs !== null && gate.retryAfterMs > DAY_MS - 5_000);
  assert.ok(gate.retryAfterMs! <= DAY_MS);
});

test('a completion older than the window no longer blocks', async () => {
  const gate = await checkTryoutGate(issueUsedCookieValue(Date.now() - DAY_MS - 1_000), '203.0.113.3');
  assert.equal(gate.blocked, false);
});

test('a session cookie round-trips its tryout id', () => {
  const id = '62412c10-126f-40dd-a057-b9b10550a5b1';
  assert.equal(readSessionCookieValue(issueSessionCookieValue(id)), id);
});

test('a tryout id the client made up is not accepted', () => {
  // The whole point of the cookie: the id *is* the turn budget, so a caller
  // that can name its own id can hand itself a fresh 8-turn allowance.
  assert.equal(readSessionCookieValue('not-a-real-id'), null);

  const mac = issueSessionCookieValue('mine').split('.')[1];
  // A valid signature does not validate a different id.
  assert.equal(readSessionCookieValue(`theirs.${mac}`), null);
  assert.equal(readSessionCookieValue(`mine.${'0'.repeat(mac.length)}`), null);
  assert.equal(readSessionCookieValue('mine.abc'), null);
  assert.equal(readSessionCookieValue(undefined), null);
});

test('clientIp takes the first hop of x-forwarded-for', () => {
  const req = new Request('https://example.test/', {
    headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1, 10.0.0.2' },
  });
  assert.equal(clientIp(req), '198.51.100.7');

  assert.equal(clientIp(new Request('https://example.test/')), 'unknown');
  assert.equal(
    clientIp(new Request('https://example.test/', { headers: { 'x-real-ip': '198.51.100.9' } })),
    '198.51.100.9',
  );
});
