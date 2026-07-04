import { db } from '../../../../src/db';
import { users } from '../../../../src/schema';
import { getAuthUser, hashPassword, verifyPassword } from '../../../../lib/auth';
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
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      level: user.level,
      authProvider: user.authProvider,
      consentToDataSharing: user.consentToDataSharing,
    }
  });
}

export async function PATCH(req: Request) {
  const auth = getAuthUser(req);
  if (!auth) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { name, currentPassword, newPassword } = await req.json();

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId));
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return Response.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      await db.update(users).set({ name: name.trim() }).where(eq(users.id, user.id));
    }

    if (currentPassword && newPassword) {
      if (!user.passwordHash) {
        return Response.json({ error: 'Cannot change password on OAuth accounts' }, { status: 400 });
      }

      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        return Response.json({ error: 'Current password is incorrect' }, { status: 400 });
      }

      if (newPassword.length < 6) {
        return Response.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
      }

      const passwordHash = await hashPassword(newPassword);
      await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    }

    const [updated] = await db.select().from(users).where(eq(users.id, user.id));

    return Response.json({
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        level: updated.level,
        authProvider: updated.authProvider,
        consentToDataSharing: updated.consentToDataSharing,
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
