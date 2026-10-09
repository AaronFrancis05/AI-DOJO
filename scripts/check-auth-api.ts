import 'dotenv/config';

const { createNeonAuth } = await import('@neondatabase/auth/next/server');
const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function printKeys(obj: unknown, prefix = '') {
  if (!isRecord(obj)) return;
  const keys = Object.keys(obj).slice(0, 30);
  for (const k of keys) {
    const v = obj[k];
    const type = typeof v === 'function' ? 'fn' : typeof v;
    const sub = typeof v === 'object' && v !== null ? ` (${Object.keys(v).length} keys)` : '';
    console.log(`${prefix}${k}: ${type}${sub}`);
  }
}

console.log('=== auth top-level keys ===');
printKeys(auth);

console.log('\n=== auth.api ===');
printKeys(auth.api);

if (auth.api?.createUser) {
  console.log('\ncreateUser signature:', auth.api.createUser.toString().slice(0, 200));
}

// Try other common property names
for (const prop of ['server', 'admin', 'internal', 'client', 'hooks', 'endpoints', '_api']) {
  if (isRecord(auth) && auth[prop]) {
    console.log(`\n=== auth.${prop} ===`);
    printKeys(auth[prop]);
  }
}
