import { getAuthUser } from '../../../../lib/auth/server';

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return Response.json({});
}

export async function PUT() {
  return Response.json({ success: true });
}
