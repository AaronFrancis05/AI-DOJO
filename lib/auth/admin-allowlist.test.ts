import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { adminSignupConfigured, isAdminEmail } from './admin-allowlist';

const original = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = original;
});

test('an allowlisted address may be promoted', () => {
  process.env.ADMIN_EMAILS = 'ops@aidojo.app,founder@aidojo.app';
  assert.equal(isAdminEmail('ops@aidojo.app'), true);
  assert.equal(isAdminEmail('founder@aidojo.app'), true);
});

test('matching ignores case and surrounding whitespace on both sides', () => {
  // The env var is hand-typed into a dashboard, the email into a form.
  process.env.ADMIN_EMAILS = '  Ops@AiDojo.app , founder@aidojo.app ';
  assert.equal(isAdminEmail('OPS@aidojo.app'), true);
  assert.equal(isAdminEmail(' founder@aidojo.app '), true);
});

test('anyone not on the list is refused', () => {
  process.env.ADMIN_EMAILS = 'ops@aidojo.app';
  assert.equal(isAdminEmail('attacker@example.com'), false);
  // No substring or suffix matching — the whole address or nothing.
  assert.equal(isAdminEmail('notops@aidojo.app'), false);
  assert.equal(isAdminEmail('ops@aidojo.app.evil.com'), false);
});

test('an unset or empty allowlist allows nobody', () => {
  // Fails closed on purpose: a missing env var must not turn the unlinked
  // admin sign-up into an open door.
  delete process.env.ADMIN_EMAILS;
  assert.equal(isAdminEmail('ops@aidojo.app'), false);
  assert.equal(adminSignupConfigured(), false);

  process.env.ADMIN_EMAILS = '  ,  , ';
  assert.equal(isAdminEmail('ops@aidojo.app'), false);
  assert.equal(adminSignupConfigured(), false);
});

test('an absent email is refused rather than matching a blank entry', () => {
  process.env.ADMIN_EMAILS = 'ops@aidojo.app';
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(undefined), false);
  assert.equal(isAdminEmail(''), false);
});
