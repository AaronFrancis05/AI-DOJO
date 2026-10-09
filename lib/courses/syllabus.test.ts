import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixShareFor, isUnitAchieved, lessonTimings, parseCanDo, TUTOR_LESSON_TEMPLATE } from './syllabus';

test('phase timings always add up to the booked duration', () => {
  for (const duration of [30, 45, 60]) {
    for (const share of [0, 0.15, 0.25, 0.35, 0.9]) {
      const timings = lessonTimings(duration, share);
      assert.equal(timings.reduce((sum, t) => sum + t.minutes, 0), duration, `${duration} min at ${share}`);
      assert.deepEqual(timings.map((t) => t.key), TUTOR_LESSON_TEMPLATE.map((p) => p.key));
      assert.ok(timings.every((t) => t.minutes >= 1));
    }
  }
});

test('the fix slot gets about a quarter, less for beginners and more for advanced learners', () => {
  const fix = (duration: number, share: number) =>
    lessonTimings(duration, share).find((t) => t.key === 'fix_slot')?.minutes;
  assert.equal(fix(60, 0.25), 15);
  assert.equal(fixShareFor(null), 0.25);
  assert.ok(fixShareFor('A1') < fixShareFor('B1'));
  assert.ok(fixShareFor('C1') > fixShareFor('B2'));
});

test('can-do statements parse defensively and a unit is achieved only when all are', () => {
  assert.deepEqual(parseCanDo('["Can greet", " ", 3, "Can ask"]'), ['Can greet', 'Can ask']);
  assert.deepEqual(parseCanDo('not json'), []);
  assert.deepEqual(parseCanDo(null), []);
  assert.equal(isUnitAchieved(2, ['achieved', 'achieved']), true);
  assert.equal(isUnitAchieved(2, ['achieved', 'practised']), false);
  assert.equal(isUnitAchieved(2, ['achieved']), false);
  assert.equal(isUnitAchieved(0, []), false);
});
