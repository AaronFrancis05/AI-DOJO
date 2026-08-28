import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdminDestination,
  roleHome,
  roleSignInPath,
  roleSignUpPath,
  safeNext,
} from './destinations';

test('each role lands on its own surface', () => {
  assert.equal(roleHome('learner'), '/home');
  assert.equal(roleHome('tutor'), '/tutor');
  assert.equal(roleHome('admin'), '/admin');
});

test('an unknown or absent role lands on the learner home', () => {
  // Signed out, or a role read that failed — never a console.
  assert.equal(roleHome(null), '/home');
});

test('an admin landing is recognised as one', () => {
  // What tells the verification page it still owes a claim. Tracks roleHome
  // rather than a second literal, so moving the console moves both.
  assert.equal(isAdminDestination(roleHome('admin')), true);
  assert.equal(isAdminDestination('/admin'), true);
});

test('any other landing owes no admin claim', () => {
  assert.equal(isAdminDestination('/home'), false);
  assert.equal(isAdminDestination('/tutor'), false);
  assert.equal(isAdminDestination(null), false);
  assert.equal(isAdminDestination(undefined), false);
});

test('each role has its own door', () => {
  assert.equal(roleSignInPath('learner'), '/auth/signin');
  assert.equal(roleSignInPath('tutor'), '/auth/tutor/signin');
  assert.equal(roleSignInPath('admin'), '/auth/admin/signin');

  assert.equal(roleSignUpPath('learner'), '/auth/signup');
  assert.equal(roleSignUpPath('tutor'), '/auth/tutor/signup');
  assert.equal(roleSignUpPath('admin'), '/auth/admin/signup');
});

test('safeNext keeps same-origin paths', () => {
  assert.equal(safeNext('/tutor'), '/tutor');
  assert.equal(safeNext('/onboarding/tutor/welcome'), '/onboarding/tutor/welcome');
});

test('safeNext refuses anything that leaves the site', () => {
  assert.equal(safeNext(null), null);
  assert.equal(safeNext(''), null);
  assert.equal(safeNext('https://evil.example'), null);
  assert.equal(safeNext('//evil.example'), null);
});

test('safeNext refuses the spellings that re-parse as an absolute URL', () => {
  // The URL parser treats a backslash as a forward slash and strips
  // tab/newline/CR before parsing, so each of these clears a naive
  // startsWith('//') test and then resolves to https://evil.example.
  assert.equal(safeNext('/\\evil.example'), null);
  assert.equal(safeNext('/\\/evil.example'), null);
  assert.equal(safeNext('/\t/evil.example'), null);
  assert.equal(safeNext('/\n/evil.example'), null);
  assert.equal(safeNext('/\r/evil.example'), null);
});
