import { db } from '../../../../src/db';
import { users } from '../../../../src/schema';
import { getAuthUser } from '../../../../lib/auth';
import { eq } from 'drizzle-orm';

export async function GET(req: Request) {
  const auth = getAuthUser(req);
  if (!auth) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  return Response.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, level: user.level, consentToDataSharing: user.consentToDataSharing }
  });
}
