import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthErrorCode, getAuthErrorMessage } from './errors';

test('does not reveal that an email address already has an account during sign-up', () => {
  assert.equal(
    getAuthErrorMessage(
      { code: 'USER_ALREADY_EXISTS' },
      'Something went wrong. Please try again.',
      'sign-up',
    ),
    'Please check the information you entered, then try signing in.',
  );
});

test('uses a neutral message for password length errors', () => {
  assert.equal(
    getAuthErrorMessage({ code: 'PASSWORD_TOO_SHORT' }, 'Fallback'),
    'There is a problem with the password length.',
  );
  assert.equal(
    getAuthErrorMessage({ code: 'PASSWORD_TOO_LONG' }, 'Fallback'),
    'There is a problem with the password length.',
  );
});

test('normalizes the codes /auth/tutor branches on', () => {
  // The tutor application recovers from these instead of dead-ending, so the
  // comparison it makes has to survive the provider's SCREAMING_CASE and the
  // hyphenated spellings alike.
  assert.equal(getAuthErrorCode({ code: 'USER_ALREADY_EXISTS' }), 'user_already_exists');
  assert.equal(getAuthErrorCode({ code: 'EMAIL_NOT_VERIFIED' }), 'email_not_verified');
  assert.equal(getAuthErrorCode({ code: 'email-not-verified' }), 'email_not_verified');
  // No code, but the message says it plainly.
  assert.equal(
    getAuthErrorCode({ message: 'User already exists. Use another email.' }),
    'user_already_exists',
  );
  assert.equal(getAuthErrorCode({ status: 500 }), '');
  assert.equal(getAuthErrorCode(null), '');
});

test('maps the OAuth proxy redirect codes off /auth?error=', () => {
  // These reach the page as a bare query-string code, not a thrown error.
  // Falling through to the generic fallback would hide which leg of the OAuth
  // round trip actually broke.
  const cases: Array<[string, string]> = [
    ['init_failed', 'Could not reach the sign-in provider. Please try again.'],
    ['no_oauth_url', 'Could not start Google sign-in. Please try again.'],
    ['no_verifier', 'Sign-in did not complete. Please try again.'],
    ['exchange_failed', 'Sign-in did not complete. Please try again.'],
  ];

  for (const [code, expected] of cases) {
    assert.equal(getAuthErrorMessage({ code }, 'Fallback', 'sign-in'), expected, code);
  }
});
