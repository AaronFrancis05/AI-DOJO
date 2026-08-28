import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimAdmin,
  isAdminDestination,
  roleHome,
  roleSignInPath,
  roleSignUpPath,
  safeNext,
} from './destinations';

/** Stands in for the one `fetch` claimAdmin makes, and restores it after. */
async function withFetch(
  impl: () => Promise<Response> | never,
  run: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof globalThis.fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('each role lands on its own surface', () => {
  assert.equal(roleHome('learner'), '/home');
  assert.equal(roleHome('tutor'), '/tutor');
  assert.equal(roleHome('admin'), '/admin');
});

test('an unknown or absent role lands on the learner home', () => {
  // Signed out, or a role read that failed — never a console.
  assert.equal(roleHome(null), '/home');
});

test('an admin landing is recognised as one', () => {
  // What tells the verification page it still owes a claim. Tracks roleHome
  // rather than a second literal, so moving the console moves both.
  assert.equal(isAdminDestination(roleHome('admin')), true);
  assert.equal(isAdminDestination('/admin'), true);
});

test('any other landing owes no admin claim', () => {
  assert.equal(isAdminDestination('/home'), false);
  assert.equal(isAdminDestination('/tutor'), false);
  assert.equal(isAdminDestination(null), false);
  assert.equal(isAdminDestination(undefined), false);
});

test('an allowlisted address is claimed', async () => {
  await withFetch(
    async () => jsonResponse(200, { success: true, role: 'admin' }),
    async () => {
      assert.deepEqual(await claimAdmin(), { status: 'claimed' });
    },
  );
});

test('only a 403 is a denial — the allowlist is the one thing that can refuse', async () => {
  await withFetch(
    async () => jsonResponse(403, { error: 'This address is not authorised for admin access.' }),
    async () => {
      const claim = await claimAdmin();
      assert.equal(claim.status, 'denied');
      // The route's own wording reaches the person, not a paraphrase of it.
      assert.match(claim.message, /not authorised/);
    },
  );
});

test('a failure that says nothing about the address is never a denial', async () => {
  // Demoting on any of these is what stranded a real admin in the learner
  // app over a blip: no session yet, no row read, a 5xx, an offline browser.
  for (const status of [401, 404, 500, 502]) {
    await withFetch(
      async () => jsonResponse(status, { error: 'Unauthorized' }),
      async () => {
        assert.equal((await claimAdmin()).status, 'unavailable', `status ${status}`);
      },
    );
  }

  await withFetch(
    () => {
      throw new TypeError('Failed to fetch');
    },
    async () => {
      const claim = await claimAdmin();
      assert.equal(claim.status, 'unavailable');
      assert.match(claim.message, /reach the server/);
    },
  );
});

test('a refusal with no parseable body still reads as a denial', async () => {
  await withFetch(
    async () => new Response('<html>gateway</html>', { status: 403 }),
    async () => {
      const claim = await claimAdmin();
      assert.equal(claim.status, 'denied');
      assert.ok(claim.message.length > 0);
    },
  );
});

test('each role has its own door', () => {
  assert.equal(roleSignInPath('learner'), '/auth/signin');
  assert.equal(roleSignInPath('tutor'), '/auth/tutor/signin');
  assert.equal(roleSignInPath('admin'), '/auth/admin/signin');

  assert.equal(roleSignUpPath('learner'), '/auth/signup');
  assert.equal(roleSignUpPath('tutor'), '/auth/tutor/signup');
  assert.equal(roleSignUpPath('admin'), '/auth/admin/signup');
});

test('safeNext keeps same-origin paths', () => {
  assert.equal(safeNext('/tutor'), '/tutor');
  assert.equal(safeNext('/onboarding/tutor/welcome'), '/onboarding/tutor/welcome');
});

test('safeNext refuses anything that leaves the site', () => {
  assert.equal(safeNext(null), null);
  assert.equal(safeNext(''), null);
  assert.equal(safeNext('https://evil.example'), null);
  assert.equal(safeNext('//evil.example'), null);
});

test('safeNext refuses the spellings that re-parse as an absolute URL', () => {
  // The URL parser treats a backslash as a forward slash and strips
  // tab/newline/CR before parsing, so each of these clears a naive
  // startsWith('//') test and then resolves to https://evil.example.
  assert.equal(safeNext('/\\evil.example'), null);
  assert.equal(safeNext('/\\/evil.example'), null);
  assert.equal(safeNext('/\t/evil.example'), null);
  assert.equal(safeNext('/\n/evil.example'), null);
  assert.equal(safeNext('/\r/evil.example'), null);
});
