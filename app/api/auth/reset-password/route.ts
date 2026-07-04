import { db } from '../../../../src/db';
import { users } from '../../../../src/schema';
import { hashPassword } from '../../../../lib/auth';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return Response.json({ error: 'Token and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const [user] = await db.select().from(users)
      .where(eq(users.resetTokenHash, tokenHash));

    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      return Response.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    await db.update(users)
      .set({
        passwordHash,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        authProvider: 'credentials',
      })
      .where(eq(users.id, user.id));

    return Response.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
