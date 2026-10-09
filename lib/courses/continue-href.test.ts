import assert from 'node:assert/strict';
import test from 'node:test';
import { continueHref } from './continue-href';

test('free practice continues to the library', () => {
  assert.equal(continueHref(null, {}), '/library');
});

test('a course lesson continues onto the course page, anchored on what unlocked', () => {
  assert.equal(
    continueHref(
      {
        courseSlug: 'japanese-a1',
        unitId: 4,
        unitTitle: 'Greetings',
        unitCompleted: false,
        nextLessonId: 12,
        nextLessonTitle: 'Ordering',
        levelCompleted: false,
      },
      { targetLanguage: 'ja', nativeLanguage: 'en' },
    ),
    '/courses/japanese-a1?target=ja&native=en#lesson-12',
  );
});

test('finishing a unit lands on the unit anchor, not the next lesson', () => {
  assert.equal(
    continueHref(
      {
        courseSlug: 'japanese-a1',
        unitId: 4,
        unitTitle: 'Greetings',
        unitCompleted: true,
        nextLessonId: 12,
        nextLessonTitle: 'Ordering',
        levelCompleted: false,
      },
      { targetLanguage: 'ja' },
    ),
    '/courses/japanese-a1?target=ja#unit-4',
  );
});
