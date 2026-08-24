import { getAuthUser } from '@/lib/auth/server';
import { cacheGet, cacheSet, cacheKeys, TTL } from '@/lib/cache';

const MAX_SPEECH_TOKENS_PER_IP_PER_HOUR = 30;

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    // Allow unauthenticated tryout guests with rate limiting (same window as tryout)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimitKey = cacheKeys.tryoutRateLimit(`speech:${ip}`);
    const currentCount = (await cacheGet<number>(rateLimitKey)) ?? 0;
    if (currentCount >= MAX_SPEECH_TOKENS_PER_IP_PER_HOUR) {
      return Response.json({ error: 'Too many speech requests. Please try again later.' }, { status: 429 });
    }
    await cacheSet(rateLimitKey, currentCount + 1, TTL.TRYOUT_RATE_LIMIT);
  }

  const region = process.env.AZURE_SPEECH_REGION;
  const key = process.env.AZURE_SPEECH_KEY;

  if (!region || !key) {
    return Response.json(
      { error: 'Azure Speech credentials not configured' },
      { status: 500 },
    );
  }

  // Azure tokens live 10 minutes — reuse one instead of minting per page load.
  // Every mint is an outbound HTTPS call that can hit a connect timeout.
  const tokenCacheKey = cacheKeys.speechToken(region);
  const cachedToken = await cacheGet<string>(tokenCacheKey);
  if (cachedToken) {
    return Response.json({ token: cachedToken, region });
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
    await cacheSet(tokenCacheKey, token, TTL.SPEECH_TOKEN);

    return Response.json({ token, region });
  } catch (err) {
    console.error('[Speech Token] Failed to issue token:', err);
    return Response.json({ error: 'Failed to issue speech token' }, { status: 500 });
  }
}