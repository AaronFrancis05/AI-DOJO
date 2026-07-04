import { db } from '../../../../src/db';
import { users } from '../../../../src/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (user && user.authProvider !== 'google') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await db.update(users)
        .set({
          resetTokenHash: tokenHash,
          resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        .where(eq(users.id, user.id));

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
      const resetLink = `${baseUrl}/auth/reset?token=${rawToken}`;

      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'AI DOJO <noreply@yourapp.com>',
            to: email,
            subject: 'Reset your AI DOJO password',
            html: `<p>Click the link below to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 60 minutes.</p>`,
          }),
        });
      } else {
        console.log(`[DEV] Password reset link for ${email}: ${resetLink}`);
      }
    }

    return Response.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
