import 'dotenv/config';

async function main() {
  const { createNeonAuth } = await import('@neondatabase/auth/next/server');
  const auth = createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });
  console.log('auth keys:', Object.keys(auth));
  if (auth.api) {
    console.log('auth.api keys:', Object.keys(auth.api));
  }
}

main().catch(console.error);
