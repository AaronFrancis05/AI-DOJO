import { db } from '../../../../src/db';
import { users } from '../../../../src/schema';
import { verifyPassword, setAuthCookie } from '../../../../lib/auth';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !user.passwordHash) {
      const hint = user?.authProvider === 'google' ? ' This account uses Google sign-in.' : '';
      return Response.json({ error: `Invalid email or password.${hint}` }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const cookie = setAuthCookie(user.id, user.email);

    return new Response(JSON.stringify({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, level: user.level, consentToDataSharing: user.consentToDataSharing }
    }), {
      status: 200,
      headers: { 'Set-Cookie': cookie, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Login error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
