import { db } from '../../../../../src/db';
import { sessions, shareTokens } from '../../../../../src/schema';
import { getAuthUser } from '../../../../../lib/auth/server';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

/**
 * How long a new share link stays readable. A shared report is the learner's
 * own transcript; a link pasted somewhere once should not expose it forever.
 */
const SHARE_LINK_TTL_DAYS = 90;

const newExpiry = () => new Date(Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
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

  if (session.userId !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let token: string;

  const [existing] = await db.select().from(shareTokens).where(eq(shareTokens.sessionId, sessionId));
  if (existing) {
    if (!existing.expiresAt || existing.expiresAt > new Date()) {
      return Response.json({ success: true, token: existing.token, expiresAt: existing.expiresAt });
    }
    // Expired: sharing again issues a fresh link rather than reviving the old
    // one, so a link that leaked and lapsed stays dead.
    const expiresAt = newExpiry();
    token = randomUUID();
    await db.update(shareTokens).set({ token, expiresAt, createdAt: new Date() }).where(eq(shareTokens.id, existing.id));
    return Response.json({ success: true, token, expiresAt }, { status: 201 });
  }

  token = randomUUID();
  const expiresAt = newExpiry();
  try {
    await db.insert(shareTokens).values({ sessionId, token, expiresAt });
  } catch (err: unknown) {
    // Race condition: unique constraint violation means another request created it first
    const [dup] = await db.select().from(shareTokens).where(eq(shareTokens.sessionId, sessionId));
    if (dup) {
      return Response.json({ success: true, token: dup.token });
    }
    throw err;
  }

  return Response.json({ success: true, token, expiresAt }, { status: 201 });
}
