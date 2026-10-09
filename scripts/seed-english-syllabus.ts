/* ─────────────────────────────────────────────────────────────
   Seed: the English CEFR syllabus (PLAN.md 4.7, 4.8 part 2).

   Built on the existing course tables — courses → course_levels (with a CEFR
   band) → units (with can-do statements) → lessons → lesson_phases — not a
   second curriculum system. Each unit has:
     1. a self-study lesson in strands (learn, practice, apply, reading and
        writing, review), and
     2. a tutor lesson carrying the standard template (warm-up, present,
        controlled practice, free practice, personal fix slot, wrap-up), whose
        objectives hold the unit's grammar, vocabulary and pronunciation
        points. Lesson plans (app/api/bookings/[id]/lesson-plan) teach from it.
   The A0 "Classroom English starter" unit comes first: ~30 survival phrases
   for following a lesson taught entirely in English.

   DRAFT CONTENT. Two units per level, A1 to C1, aligned to the CEFR global
   descriptors. An experienced English teacher must review it before the
   pilot, and that is why the course is seeded INACTIVE: it drives lesson
   plans, briefings and the progress map (which read it directly), but stays
   out of the /courses catalogue until someone sets is_active after review
   and links role-play scenarios to the self-study lessons.

   Usage:
      npm run db:seed-english-syllabus

   Idempotent: every row is upserted on its natural key (course slug, level
   order, unit order, lesson order, phase order), so a second run leaves the
   row counts unchanged and only refreshes text.
   ───────────────────────────────────────────────────────────── */
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db';
import { courseLevels, courses, lessonPhases, lessons, units } from '../src/schema';
import { READING_WRITING_PHASE, TUTOR_LESSON_TEMPLATE } from '../lib/courses/syllabus';

interface UnitSeed {
  title: string;
  description: string;
  canDo: string[];
  grammar: string;
  vocabulary: string;
  pronunciation: string;
  readingWriting: string;
  rolePlay: string;
}

interface LevelSeed {
  cefr: string;
  title: string;
  description: string;
  units: UnitSeed[];
}

const CLASSROOM_PHRASES = [
  'Hello. / Goodbye.', 'My name is …', 'Yes. / No.', 'Please. / Thank you.', 'Sorry?',
  'Listen.', 'Repeat.', 'Look.', 'Read.', 'Write.',
  'Again, please.', 'Slower, please.', 'Louder, please.', 'I don\'t understand.', 'I understand.',
  'How do you say … in English?', 'What does … mean?', 'How do you spell it?', 'Can you write it, please?', 'Is this right?',
  'I don\'t know.', 'One moment, please.', 'Can you help me?', 'I have a question.', 'Page …',
  'Your turn. / My turn.', 'Good! / Well done!', 'Let\'s start.', 'Let\'s stop.', 'See you next time.',
];

const SYLLABUS: LevelSeed[] = [
  {
    cefr: 'A0',
    title: 'Starter',
    description: 'For learners who cannot yet follow a lesson in English. Finish this before a tutor lesson.',
    units: [{
      title: 'Classroom English',
      description: 'The 30 survival phrases for following a lesson taught entirely in English.',
      canDo: [
        'Can greet the tutor, say their name and say goodbye',
        'Can ask the tutor to repeat, slow down or explain a word',
        'Can follow simple classroom instructions: listen, repeat, read, write',
      ],
      grammar: 'Imperatives (Listen. Repeat.) and polite requests with "please"',
      vocabulary: CLASSROOM_PHRASES.join(' · '),
      pronunciation: 'Rising intonation on questions ("Sorry?", "Again?")',
      readingWriting: 'Read and copy the 30 phrases; write your own name and greeting',
      rolePlay: 'The first two minutes of a lesson: greet, give your name, ask the tutor to repeat',
    }],
  },
  {
    cefr: 'A1',
    title: 'Beginner',
    description: 'Simple everyday exchanges about yourself and your day.',
    units: [
      {
        title: 'About me',
        description: 'Introduce yourself and exchange personal details.',
        canDo: [
          'Can introduce themselves and others',
          'Can ask and answer simple questions about name, country, job and family',
        ],
        grammar: 'Present simple of "be" (I am, you are, she is) and question forms',
        vocabulary: 'Countries and nationalities, jobs, family members, numbers 1-100',
        pronunciation: 'Contractions: I\'m, you\'re, he\'s; word stress in nationalities',
        readingWriting: 'Read a short profile; fill in a simple form with personal details',
        rolePlay: 'Meeting a new colleague on the first day at work',
      },
      {
        title: 'My day',
        description: 'Talk about routines, times and habits.',
        canDo: [
          'Can describe their daily routine in simple sentences',
          'Can tell the time and say when things happen',
        ],
        grammar: 'Present simple for routines, third-person -s, adverbs of frequency',
        vocabulary: 'Daily activities, times of day, days of the week',
        pronunciation: 'Third-person -s: /s/, /z/, /ɪz/',
        readingWriting: 'Read a weekly timetable; write five sentences about your day',
        rolePlay: 'A friend asks about your typical week to find a time to meet',
      },
    ],
  },
  {
    cefr: 'A2',
    title: 'Elementary',
    description: 'Short exchanges about past events and experiences.',
    units: [
      {
        title: 'Last weekend',
        description: 'Talk about what happened and what you did.',
        canDo: [
          'Can describe past activities and personal experiences in simple terms',
          'Can ask someone about their weekend and react to the answer',
        ],
        grammar: 'Past simple: regular and common irregular verbs, questions and negatives',
        vocabulary: 'Leisure activities, time expressions (yesterday, last week, ago)',
        pronunciation: '-ed endings: /t/, /d/, /ɪd/',
        readingWriting: 'Read a short email about a trip; write a reply about your weekend',
        rolePlay: 'Monday morning: catching up with a colleague about the weekend',
      },
      {
        title: 'Have you ever…?',
        description: 'Share experiences and recent news.',
        canDo: [
          'Can talk about experiences they have and have not had',
          'Can give and ask for simple news about recent events',
        ],
        grammar: 'Present perfect for experience (ever, never) and recent news (just, already, yet), contrasted with past simple',
        vocabulary: 'Travel and experiences, past participles of common verbs',
        pronunciation: 'Weak forms: have /həv/, been /bɪn/',
        readingWriting: 'Read short travel reviews; write about a place you have visited',
        rolePlay: 'A travel agent asks about your past trips to suggest a holiday',
      },
    ],
  },
  {
    cefr: 'B1',
    title: 'Intermediate',
    description: 'Keep a conversation going on familiar topics, with reasons and plans.',
    units: [
      {
        title: 'Telling stories',
        description: 'Narrate events and describe how people felt.',
        canDo: [
          'Can narrate a story and describe their reactions',
          'Can describe past experiences and give reasons',
        ],
        grammar: 'Past continuous vs past simple; sequencing linkers (first, then, when, while)',
        vocabulary: 'Feelings and reactions, story linkers',
        pronunciation: 'Sentence stress and chunking in longer turns',
        readingWriting: 'Read a short anecdote; write a 120-word story with linkers',
        rolePlay: 'Telling a friend about something surprising that happened on the way to work',
      },
      {
        title: 'Plans and arrangements',
        description: 'Explain plans, make arrangements and change them.',
        canDo: [
          'Can explain plans and give reasons for them',
          'Can make, confirm and change an arrangement',
        ],
        grammar: 'Future forms: going to, present continuous for arrangements, will for decisions',
        vocabulary: 'Scheduling, invitations, polite refusals',
        pronunciation: '"Going to" → /ˈɡʌnə/ in natural speech; polite intonation',
        readingWriting: 'Read a meeting invitation; write an email changing an arrangement',
        rolePlay: 'Rescheduling a meeting with a client by video call',
      },
    ],
  },
  {
    cefr: 'B2',
    title: 'Upper intermediate',
    description: 'Interact fluently, argue a viewpoint and handle the unexpected.',
    units: [
      {
        title: 'Opinions and arguments',
        description: 'Present, defend and challenge a point of view.',
        canDo: [
          'Can present and defend a viewpoint with supporting reasons',
          'Can speculate about causes, consequences and hypothetical situations',
        ],
        grammar: 'Second and third conditionals; hedging (it seems, I would argue)',
        vocabulary: 'Opinion and disagreement language, discourse markers',
        pronunciation: 'Contrastive stress to signal disagreement',
        readingWriting: 'Read an opinion article; write a for-and-against paragraph',
        rolePlay: 'A team debate on whether to move to a four-day week',
      },
      {
        title: 'Meetings at work',
        description: 'Take an active part in meetings and report what was said.',
        canDo: [
          'Can take an active part in a work meeting',
          'Can summarise and report what others have said',
        ],
        grammar: 'The passive; reported speech and reporting verbs (suggest, insist, agree)',
        vocabulary: 'Meetings: agenda, action points, interrupting politely',
        pronunciation: 'Linking and weak forms in fast speech',
        readingWriting: 'Read meeting minutes; write a summary email of a meeting',
        rolePlay: 'Running the last ten minutes of a project meeting and agreeing action points',
      },
    ],
  },
  {
    cefr: 'C1',
    title: 'Advanced',
    description: 'Express ideas fluently and precisely for social and professional purposes.',
    units: [
      {
        title: 'Presenting and persuading',
        description: 'Structure complex ideas and handle questions spontaneously.',
        canDo: [
          'Can give a clear, well-structured presentation on a complex subject',
          'Can handle questions and objections spontaneously',
        ],
        grammar: 'Cleft sentences and fronting for emphasis (What we need is…)',
        vocabulary: 'Signposting, persuasive language, collocations for business and society',
        pronunciation: 'Pausing and pitch range for emphasis',
        readingWriting: 'Read a persuasive proposal; write a structured 250-word proposal',
        rolePlay: 'Pitching a proposal to a sceptical manager',
      },
      {
        title: 'Nuance and register',
        description: 'Adjust tone and express fine shades of meaning.',
        canDo: [
          'Can adjust register to the situation and the relationship',
          'Can express fine shades of opinion, certainty and doubt',
        ],
        grammar: 'Modals of deduction in the past; mixed conditionals; softening language',
        vocabulary: 'Formal vs informal equivalents, idiomatic expressions',
        pronunciation: 'Intonation for politeness, irony and tentativeness',
        readingWriting: 'Rewrite one message in three registers; read and respond to a formal complaint',
        rolePlay: 'Delivering difficult feedback to a colleague diplomatically',
      },
    ],
  },
];

function selfStudyPhases(u: UnitSeed) {
  return [
    { key: 'learn', title: 'Learn', objective: `Grammar: ${u.grammar}. Vocabulary: ${u.vocabulary}.` },
    { key: 'practice', title: 'Practice', objective: `Drill the new language. Pronunciation: ${u.pronunciation}.` },
    { key: 'apply', title: 'Apply', objective: `Role-play: ${u.rolePlay}.` },
    { key: READING_WRITING_PHASE, title: 'Reading and writing', objective: u.readingWriting },
    { key: 'review', title: 'Review', objective: `Check: ${u.canDo.join('; ')}.` },
  ];
}

function tutorPhases(u: UnitSeed) {
  const objective: Record<string, string> = {
    warm_up: 'Review the last lesson and the homework study pack.',
    present: `Present: ${u.grammar}. Key vocabulary: ${u.vocabulary}.`,
    controlled: `Controlled practice of the new point. Pronunciation focus: ${u.pronunciation}.`,
    free_practice: `Role-play: ${u.rolePlay}.`,
    fix_slot: 'Targeted work on this learner\'s recurring mistakes, from the briefing.',
    wrap_up: `Recap, mark the can-do statements, and set the homework (${u.readingWriting}).`,
  };
  return TUTOR_LESSON_TEMPLATE.map((p) => ({ key: p.key, title: p.title, objective: objective[p.key] }));
}

async function upsertPhases(lessonId: number, phases: { key: string; title: string; objective: string }[]) {
  await db
    .insert(lessonPhases)
    .values(phases.map((p, i) => ({
      lessonId,
      sequenceOrder: i + 1,
      phaseKey: p.key,
      title: p.title,
      objective: p.objective,
      durationMinutes: 5,
    })))
    .onConflictDoUpdate({
      target: [lessonPhases.lessonId, lessonPhases.sequenceOrder],
      set: {
        phaseKey: sql`excluded.phase_key`,
        title: sql`excluded.title`,
        objective: sql`excluded.objective`,
      },
    });
}

async function upsertLesson(unitId: number, sequenceOrder: number, title: string, summary: string, minutes: number) {
  const [row] = await db
    .insert(lessons)
    .values({ unitId, sequenceOrder, title, summary, estimatedMinutes: minutes })
    .onConflictDoUpdate({
      target: [lessons.unitId, lessons.sequenceOrder],
      set: { title, summary, estimatedMinutes: minutes },
    })
    .returning({ id: lessons.id });
  return row.id;
}

async function main() {
  const courseValues = {
    slug: 'english-cefr',
    title: 'English: A0 to C1',
    description: 'A structured English course on the CEFR scale. Every tutor lesson combines the next syllabus step with a short slot for your own recurring mistakes.',
    targetLanguage: 'en',
    difficulty: 'beginner',
    icon: 'GraduationCap',
    displayOrder: 2,
  };
  const [course] = await db
    .insert(courses)
    // Inactive on first insert only: a reviewer who activates it must not
    // have the next seed run hide it again.
    .values({ ...courseValues, isActive: false })
    .onConflictDoUpdate({ target: courses.slug, set: courseValues })
    .returning({ id: courses.id });

  let unitCount = 0;
  for (const [li, level] of SYLLABUS.entries()) {
    const [levelRow] = await db
      .insert(courseLevels)
      .values({ courseId: course.id, sequenceOrder: li + 1, title: level.title, description: level.description, cefrLevel: level.cefr })
      .onConflictDoUpdate({
        target: [courseLevels.courseId, courseLevels.sequenceOrder],
        set: { title: level.title, description: level.description, cefrLevel: level.cefr },
      })
      .returning({ id: courseLevels.id });

    for (const [ui, unit] of level.units.entries()) {
      const [unitRow] = await db
        .insert(units)
        .values({
          levelId: levelRow.id,
          sequenceOrder: ui + 1,
          title: unit.title,
          description: unit.description,
          canDo: JSON.stringify(unit.canDo),
        })
        .onConflictDoUpdate({
          target: [units.levelId, units.sequenceOrder],
          set: { title: unit.title, description: unit.description, canDo: JSON.stringify(unit.canDo) },
        })
        .returning({ id: units.id });

      const selfStudy = await upsertLesson(unitRow.id, 1, `${unit.title}: self-study`, unit.description, 20);
      await upsertPhases(selfStudy, selfStudyPhases(unit));
      const tutorLesson = await upsertLesson(unitRow.id, 2, `${unit.title}: lesson with your tutor`, unit.description, 30);
      await upsertPhases(tutorLesson, tutorPhases(unit));
      unitCount++;
    }
  }

  const [{ n: levelCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(courseLevels)
    .where(eq(courseLevels.courseId, course.id));
  console.log(`English syllabus seeded: ${levelCount} levels, ${unitCount} units (course id ${course.id}, inactive until reviewed).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
