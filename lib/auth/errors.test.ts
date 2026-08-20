import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthErrorMessage } from './errors';

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
