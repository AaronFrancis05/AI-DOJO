import 'dotenv/config';

async function main() {
  const { createNeonAuth } = await import('@neondatabase/auth/next/server');
  const auth = createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });

  console.log('=== Top-level keys ===');
  for (const k of Object.keys(auth).sort()) {
    const v = (auth as any)[k];
    const type = typeof v === 'function' ? 'fn' : typeof v;
    if (type === 'object' && v !== null) {
      const sub = Object.keys(v).slice(0, 10);
      console.log(`  ${k}: object [${sub.join(', ')}${Object.keys(v).length > 10 ? ', ...' : ''}]`);
    } else {
      console.log(`  ${k}: ${type}`);
    }
  }
}
main().catch(console.error);
