import { db } from '../../../../../src/db';
import { sessions, shareTokens } from '../../../../../src/schema';
import { getAuthUser } from '../../../../../lib/auth';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getAuthUser(req);
  if (!auth) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = Number(id);
  if (isNaN(sessionId)) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.userId !== auth.userId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let token: string;

  const [existing] = await db.select().from(shareTokens).where(eq(shareTokens.sessionId, sessionId));
  if (existing) {
    token = existing.token;
    return Response.json({ success: true, token });
  }

  token = randomUUID();
  try {
    await db.insert(shareTokens).values({ sessionId, token });
  } catch (err: any) {
    // Race condition: unique constraint violation means another request created it first
    const [dup] = await db.select().from(shareTokens).where(eq(shareTokens.sessionId, sessionId));
    if (dup) {
      return Response.json({ success: true, token: dup.token });
    }
    throw err;
  }

  return Response.json({ success: true, token }, { status: 201 });
}
