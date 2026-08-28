import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { classSessions, courses, tutorAnnouncements, tutors } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { createNotifications } from '@/lib/notifications';
import { isAudienceKind, resolveAudience } from '@/lib/tutors/audience';
import { tutorLanguageSets } from '@/lib/tutors/languages';
import { TUTORS_ENABLED } from '@/lib/tutors/config';

export const runtime = 'nodejs';

const MAX_TITLE = 160;
const MAX_BODY = 4000;

/** The signed-in tutor's own profile, or null. */
async function loadTutorProfile(userId: string) {
  const [profile] = await db.select().from(tutors).where(eq(tutors.userId, userId)).limit(1);
  return profile ?? null;
}

/**
 * Announcements a tutor has sent.
 *
 * The `tutor_announcements` row is the authored record; delivery is still one
 * `notifications` row per learner, which is what the live bell already reads.
 * Without this table a sent announcement would exist only as N notifications
 * scattered across N accounts, and the tutor could never see what they sent.
 */
export async function GET() {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const profile = await loadTutorProfile(user.id);
  if (!profile) return Response.json({ error: 'No tutor profile' }, { status: 404 });

  const rows = await db
    .select({
      announcement: tutorAnnouncements,
      className: classSessions.title,
      courseName: courses.title,
    })
    .from(tutorAnnouncements)
    .leftJoin(classSessions, eq(tutorAnnouncements.classSessionId, classSessions.id))
    .leftJoin(courses, eq(tutorAnnouncements.courseId, courses.id))
    .where(eq(tutorAnnouncements.tutorId, profile.id))
    .orderBy(desc(tutorAnnouncements.createdAt))
    .limit(50);

  return Response.json({
    success: true,
    announcements: rows.map((r) => ({
      id: r.announcement.id,
      title: r.announcement.title,
      body: r.announcement.body,
      targetLanguage: r.announcement.targetLanguage,
      instructionLanguage: r.announcement.instructionLanguage,
      audienceKind: r.announcement.audienceKind,
      audienceName: r.className ?? r.courseName ?? null,
      recipientCount: r.announcement.recipientCount,
      createdAt: r.announcement.createdAt,
    })),
  });
}

/**
 * Sends an announcement, or — with `?preview=1` — just counts who it reaches.
 *
 * The preview shares `resolveAudience` with the send, so the number the tutor
 * is shown before pressing Send is produced by the same query that will pick
 * the recipients. Counting it a second way is how a preview starts lying.
 */
export async function POST(req: Request) {
  if (!TUTORS_ENABLED) {
    return Response.json({ error: 'Live tutoring is not enabled.' }, { status: 404 });
  }

  let user;
  try {
    ({ user } = await requireRole('tutor'));
  } catch (err) {
    return roleErrorResponse(err);
  }

  const profile = await loadTutorProfile(user.id);
  if (!profile) return Response.json({ error: 'No tutor profile' }, { status: 404 });
  // The same gate `POST /api/classes` applies: an unverified tutor is not in
  // front of learners yet, so they cannot message them either.
  if (profile.verificationStatus !== 'verified') {
    return Response.json(
      { error: 'Your tutor profile is still awaiting verification.' },
      { status: 403 },
    );
  }

  const preview = new URL(req.url).searchParams.get('preview') === '1';

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const audienceKind = body.audienceKind;
  if (!isAudienceKind(audienceKind)) {
    return Response.json({ error: 'Unknown audience' }, { status: 400 });
  }

  const classSessionId = body.classSessionId != null ? Number(body.classSessionId) : null;
  const courseId = body.courseId != null ? Number(body.courseId) : null;
  const targetLanguage = body.targetLanguage ? String(body.targetLanguage).trim() : null;
  const instructionLanguage = body.instructionLanguage
    ? String(body.instructionLanguage).trim()
    : null;

  const { teaches, explainsIn } = tutorLanguageSets(profile);
  if (targetLanguage && !teaches.includes(targetLanguage)) {
    return Response.json(
      { error: `You are not listed as teaching ${targetLanguage}.` },
      { status: 400 },
    );
  }
  if (instructionLanguage && !explainsIn.includes(instructionLanguage)) {
    return Response.json(
      { error: `You are not listed as explaining in ${instructionLanguage}.` },
      { status: 400 },
    );
  }

  const audience = await resolveAudience(profile.id, audienceKind, {
    classSessionId,
    courseId,
    targetLanguage,
  });
  if (audience.error) {
    return Response.json({ error: audience.error }, { status: 400 });
  }

  if (preview) {
    return Response.json({ success: true, recipientCount: audience.learnerIds.length });
  }

  const title = String(body.title ?? '').trim();
  const text = String(body.body ?? '').trim();
  if (!title) return Response.json({ error: 'Give it a title.' }, { status: 400 });
  if (!text) return Response.json({ error: 'Write something to send.' }, { status: 400 });
  if (audience.learnerIds.length === 0) {
    return Response.json({ error: 'That reaches nobody right now.' }, { status: 400 });
  }

  const [created] = await db
    .insert(tutorAnnouncements)
    .values({
      tutorId: profile.id,
      title: title.slice(0, MAX_TITLE),
      body: text.slice(0, MAX_BODY),
      targetLanguage,
      instructionLanguage,
      audienceKind,
      classSessionId: audienceKind === 'class' ? classSessionId : null,
      courseId: audienceKind === 'course' ? courseId : null,
      // Counted at send time. The audience moves as learners enrol and leave,
      // so recomputing it later would not describe what was delivered.
      recipientCount: audience.learnerIds.length,
    })
    .returning({ id: tutorAnnouncements.id });

  // Fan-out through the existing helper: it writes the row the bell reads and
  // publishes on each recipient's own topic, and it never throws — the
  // announcement is already recorded above, so a Redis blip must not fail it.
  await createNotifications(audience.learnerIds, {
    type: 'announcement',
    title: title.slice(0, MAX_TITLE),
    body: text.slice(0, MAX_BODY),
    href: '/messages',
  });

  return Response.json(
    { success: true, id: created?.id ?? null, recipientCount: audience.learnerIds.length },
    { status: 201 },
  );
}
