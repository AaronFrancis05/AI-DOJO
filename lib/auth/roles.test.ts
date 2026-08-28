import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUserRole, satisfiesRole, toUserRole } from './roles';

test('toUserRole falls back to learner for anything unrecognised', () => {
  assert.equal(toUserRole('tutor'), 'tutor');
  assert.equal(toUserRole('admin'), 'admin');
  assert.equal(toUserRole('learner'), 'learner');
  // A column value written before the role existed, or by hand.
  assert.equal(toUserRole(null), 'learner');
  assert.equal(toUserRole(undefined), 'learner');
  assert.equal(toUserRole('superuser'), 'learner');
  assert.equal(toUserRole(7), 'learner');
});

test('isUserRole rejects near-misses', () => {
  assert.equal(isUserRole('admin'), true);
  assert.equal(isUserRole('Admin'), false);
  assert.equal(isUserRole(''), false);
});

test('a role satisfies itself and nothing above it', () => {
  assert.equal(satisfiesRole('tutor', 'tutor'), true);
  assert.equal(satisfiesRole('learner', 'tutor'), false);
  assert.equal(satisfiesRole('tutor', 'admin'), false);
});

test('admin satisfies every role', () => {
  assert.equal(satisfiesRole('admin', 'admin'), true);
  assert.equal(satisfiesRole('admin', 'tutor'), true);
  assert.equal(satisfiesRole('admin', 'learner'), true);
  assert.equal(satisfiesRole('admin', ['tutor', 'learner']), true);
});

test('a list of required roles is an "any of"', () => {
  assert.equal(satisfiesRole('tutor', ['tutor', 'admin']), true);
  assert.equal(satisfiesRole('learner', ['tutor', 'admin']), false);
});
