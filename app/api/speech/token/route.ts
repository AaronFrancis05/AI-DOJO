import { getAuthUser } from '@/lib/auth/server';

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const region = process.env.AZURE_SPEECH_REGION;
  const key = process.env.AZURE_SPEECH_KEY;

  if (!region || !key) {
    return Response.json(
      { error: 'Azure Speech credentials not configured' },
      { status: 500 },
    );
  }

  try {
    const tokenRes = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key } },
    );

    if (!tokenRes.ok) {
      throw new Error(`Token issuance returned ${tokenRes.status}`);
    }

    const token = await tokenRes.text();

    return Response.json({ token, region });
  } catch (err) {
    console.error('[Speech Token] Failed to issue token:', err);
    return Response.json({ error: 'Failed to issue speech token' }, { status: 500 });
  }
}