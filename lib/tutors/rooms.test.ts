import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canJoinBooking } from './rooms';

const MINUTE = 60 * 1000;

/** A room scheduled `offsetMinutes` from `now`, in the given status. */
function room(offsetMinutes: number, status = 'confirmed', durationMinutes = 60) {
  return {
    scheduledAt: new Date(Date.now() + offsetMinutes * MINUTE),
    durationMinutes,
    status,
  };
}

test('a cancelled room is never joinable, however well timed', () => {
  const decision = canJoinBooking(room(0, 'cancelled'));
  assert.equal(decision.allowed, false);
});

test('an unconfirmed booking is not joinable', () => {
  const decision = canJoinBooking(room(0, 'requested'));
  assert.equal(decision.allowed, false);
});

test('the window opens 15 minutes before the start', () => {
  assert.equal(canJoinBooking(room(20)).allowed, false);
  assert.equal(canJoinBooking(room(10)).allowed, true);
});

test('the window stays open 30 minutes past the end', () => {
  // Started 60 minutes ago, ran 60 — so it ended on the hour, 20 minutes of
  // grace left.
  assert.equal(canJoinBooking(room(-70)).allowed, true);
  // Started 100 minutes ago: 40 minutes past the end, grace exhausted.
  assert.equal(canJoinBooking(room(-100)).allowed, false);
});

test('going live opens the door regardless of the clock', () => {
  // The case the feature exists for: a tutor starts a class on the spot, or
  // hours early. The time check would answer "this has not opened yet".
  assert.equal(canJoinBooking(room(240, 'live')).allowed, true);
  assert.equal(canJoinBooking(room(-240, 'live')).allowed, true);
});

test('completing a room closes it regardless of the grace window', () => {
  // Inside the grace window, which would otherwise still allow a join.
  const decision = canJoinBooking(room(0, 'completed'));
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, 'This session has ended.');
});
