/**
 * Content for tutor vetting (PLAN.md 4.6, 4.7): the clarity read-aloud
 * passages and the teaching-method module with its check questions.
 *
 * Pure and client-safe. The quiz answers are checked server-side
 * (app/api/tutor/vetting) from the same list, so the page cannot mark itself.
 * Draft wording: an experienced English teacher should review it before the
 * pilot, as PLAN.md asks of all syllabus content.
 */

/**
 * Read aloud and scored by Azure pronunciation assessment. They mix the sounds
 * learners most often mishear (th, v/w, r/l, final consonants, weak forms) so
 * the score reflects intelligibility across the board. Accent is not scored:
 * accuracy measures whether each word was recognisably said, not how it was
 * coloured.
 */
export const CLARITY_PASSAGES = [
  'Thank you for joining the lesson today. We will practise asking for directions and checking that we understood.',
  'Last week you told me about your village. This week I would like you to describe a journey you will never forget.',
  'Listen carefully, then repeat after me. If I speak too quickly, please raise your hand and say "slower, please".',
  'Very well. Three of these words are verbs and the others are nouns. Which one would you choose for the first gap?',
] as const;

export interface ModuleSection {
  title: string;
  points: string[];
}

export const TEACHING_MODULE: ModuleSection[] = [
  {
    title: 'Teach English through English',
    points: [
      'Grade your language to the learner\'s level: short sentences, common words, one idea at a time.',
      'Show meaning with pictures, gestures, acting things out and examples before you explain.',
      'Check understanding with yes/no and either/or questions ("Is it big or small?"), never "Do you understand?".',
      'For beginners who share no language with you, lean on the lesson slides and captions; never make translation your main channel.',
    ],
  },
  {
    title: 'Use the lesson template',
    points: [
      'Every lesson runs: warm-up, present, controlled practice, free practice, personal fix slot, wrap-up.',
      'About three quarters of the time follows the syllabus; the fix slot covers the learner\'s own recurring mistakes.',
      'End with the homework and mark the unit\'s can-do statements honestly: introduced, practised or achieved.',
    ],
  },
  {
    title: 'Correct without breaking the flow',
    points: [
      'In free practice, note errors and come back to them later; in controlled practice, correct straight away.',
      'Prefer recasts ("You goed? — Ah, you went!") and prompts that let the learner fix it themselves.',
      'Correct the mistakes that block meaning or keep coming back, not every slip.',
    ],
  },
  {
    title: 'Control your talk time',
    points: [
      'The learner should speak more than you do — aim for at least 60% of the talking.',
      'Ask one question at a time and wait. Silence is thinking time.',
    ],
  },
  {
    title: 'Use the briefing and the plan',
    points: [
      'Read the briefing before the call: level, syllabus position, weak points and the last session scores.',
      'Edit the AI\'s draft lesson plan; it is a starting point, and you know the learner.',
      'After the lesson, file your notes and corrections: they become the learner\'s homework.',
    ],
  },
];

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
}

export const TEACHING_MODULE_QUIZ: QuizQuestion[] = [
  {
    id: 'check-understanding',
    question: 'A beginner looks confused. What is the best way to check understanding?',
    options: ['Ask "Do you understand?"', 'Ask a simple either/or question about the meaning', 'Translate the sentence into their language'],
    answer: 1,
  },
  {
    id: 'free-practice-errors',
    question: 'During free practice the learner makes several small errors. What do you do?',
    options: ['Stop them at each error', 'Note the errors and come back to them afterwards', 'Ignore them entirely'],
    answer: 1,
  },
  {
    id: 'talk-time',
    question: 'Who should do most of the talking in a lesson?',
    options: ['The tutor', 'The learner', 'It does not matter'],
    answer: 1,
  },
  {
    id: 'fix-slot',
    question: 'Where does the personal fix slot\'s content come from?',
    options: ['The learner\'s weak points in the briefing', 'The next syllabus unit', 'Whatever the tutor prefers that day'],
    answer: 0,
  },
];

/** All answers must be correct; the module is short enough to retake. */
export function quizPassed(answers: unknown): boolean {
  if (!answers || typeof answers !== 'object') return false;
  const given = answers as Record<string, unknown>;
  return TEACHING_MODULE_QUIZ.every((q) => Number(given[q.id]) === q.answer);
}
