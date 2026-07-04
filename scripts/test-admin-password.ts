import 'dotenv/config';

const BASE_URL = process.env.NEON_AUTH_BASE_URL!;
const USER_ID = '98a40bf3-f47c-48dd-aef0-30ab98e6231b';
const NEW_PASSWORD = 'test123456';

async function main() {
  // Try calling admin/set-user-password directly
  console.log(`POST ${BASE_URL}/admin/set-user-password`);
  const res = await fetch(`${BASE_URL}/admin/set-user-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USER_ID, newPassword: NEW_PASSWORD }),
  });
  console.log(`Status: ${res.status}`);
  const body = await res.text();
  console.log(`Body: ${body}`);
}
main().catch(console.error);
