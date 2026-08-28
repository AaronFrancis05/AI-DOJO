import { getUserRole } from '@/lib/auth/server';

export const runtime = 'nodejs';

/**
 * The signed-in account's role.
 *
 * Exists so the auth pages can route by role instead of by which form was
 * used: a tutor signing in on the learner form still belongs on `/tutor`.
 *
 * **Not an authorisation surface.** It tells the client where to navigate;
 * `/tutor` and `/admin` re-check the role server-side before rendering, and
 * every API route gates on `requireRole`. Nothing here is a capability.
 */
export async function GET() {
  const role = await getUserRole();
  if (!role) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return Response.json({ role });
}
