import { db } from '../../../../src/db';
import { users } from '../../../../src/schema';
import { hashPassword, setAuthCookie } from '../../../../lib/auth';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  try {
    const { name, email, password, consentToDataSharing } = await req.json();

    if (!name || !email || !password) {
      return Response.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      return Response.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db.insert(users).values({
      name,
      email,
      passwordHash,
      consentToDataSharing: consentToDataSharing ?? false,
    }).returning();

    const cookie = setAuthCookie(user.id, user.email);

    return new Response(JSON.stringify({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, level: user.level, consentToDataSharing: user.consentToDataSharing }
    }), {
      status: 201,
      headers: { 'Set-Cookie': cookie, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
