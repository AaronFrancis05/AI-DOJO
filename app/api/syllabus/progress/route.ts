import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { getAuthUser } from '@/lib/auth/server';
import { HYBRID_ENABLED } from '@/lib/tutors/config';
import { loadSyllabusMap } from '@/lib/courses/syllabus-data';

export const runtime = 'nodejs';

/**
 * The caller's CEFR progress map (PLAN.md 4.7): units per level of their
 * target language's syllabus, with the standing of each can-do statement.
 * `syllabus: null` when that language has no syllabus yet.
 */
export async function GET() {
  if (!HYBRID_ENABLED) return Response.json({ error: 'Not found' }, { status: 404 });

  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [row] = await db
    .select({ target: users.preferredTargetLanguage, cefrLevel: users.cefrLevel })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const syllabus = row ? await loadSyllabusMap(user.id, row.target) : null;
  return Response.json({ success: true, cefrLevel: row?.cefrLevel ?? null, syllabus });
}
