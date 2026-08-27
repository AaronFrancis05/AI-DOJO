import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';
import { isUserRole, DEFAULT_ROLE } from '@/lib/auth/roles';
import { isLanguageEnabled } from '@/lib/language-registry';

export const runtime = 'nodejs';

/**
 * Pre-provisions an account.
 *
 * **This does not create a sign-in credential, and cannot.** Neon Auth owns
 * passwords and email verification; the app has no server-side way to mint an
 * identity in it. What it does own is the `users` row, and `syncUser()` matches
 * that row **by email** — so a row written here is picked up, id and all, the
 * moment the person signs up with the same address.
 *
 * That makes this genuinely useful rather than a half-measure: an admin can set
 * someone's role, level and language pair in advance, and the person lands in
 * the right place on their first sign-in instead of walking the learner wizard
 * and being fixed up afterwards. It is an invitation, not an account handover,
 * and the console says so.
 */
export async function POST(req: Request) {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!email || !email.includes('@')) {
    return Response.json({ error: 'A valid email is required' }, { status: 400 });
  }
  if (!name) {
    return Response.json({ error: 'A name is required' }, { status: 400 });
  }
  // Refused rather than truncated: `syncUser()` matches on the whole address,
  // so an email silently cut to 150 characters would never be picked up by the
  // sign-up it was written for, and the duplicate check below would be run
  // against a different address than the one the admin typed.
  if (email.length > 150) {
    return Response.json({ error: 'Email is too long (max 150 characters)' }, { status: 400 });
  }
  if (name.length > 100) {
    return Response.json({ error: 'Name is too long (max 100 characters)' }, { status: 400 });
  }

  const role = isUserRole(body.role) ? body.role : DEFAULT_ROLE;

  const preferredTargetLanguage =
    typeof body.preferredTargetLanguage === 'string' && body.preferredTargetLanguage
      ? body.preferredTargetLanguage
      : 'ja';
  const nativeLanguage =
    typeof body.nativeLanguage === 'string' && body.nativeLanguage ? body.nativeLanguage : 'en';

  if (!(await isLanguageEnabled(preferredTargetLanguage, 'target'))) {
    return Response.json({ error: 'Unknown target language' }, { status: 400 });
  }
  if (!(await isLanguageEnabled(nativeLanguage, 'native'))) {
    return Response.json({ error: 'Unknown native language' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return Response.json({ error: 'An account with that email already exists' }, { status: 409 });
  }

  // A UUID, matching the shape Neon Auth issues. syncUser() keeps whichever id
  // is already on the row when the person signs up, so this one is permanent
  // and every foreign key written against it in the meantime stays valid.
  const id = randomUUID();

  await db.insert(users).values({
    id,
    name: name.slice(0, 100),
    email: email.slice(0, 150),
    role,
    preferredTargetLanguage,
    nativeLanguage,
    // Left null on purpose: they still walk the wizard on first sign-in, which
    // is what collects their goal, level and course enrolment. Marking it done
    // here would drop them into an app with no course.
    onboardingCompletedAt: null,
  });

  return Response.json({ success: true, user: { id, email, name, role } }, { status: 201 });
}
