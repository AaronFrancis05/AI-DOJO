import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appUrl,
  getAppOrigin,
  normalizeAuthRedirectUrl,
  withVerifiedRequestOrigin,
} from './app-origin';
import { appendSetCookies } from './cookies';

function withEnvironment(
  values: Record<string, string | undefined>,
  run: () => void,
): void {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );

  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('uses APP_ORIGIN instead of an internal standalone request URL', () => {
  withEnvironment(
    {
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://ai-dojo.akademia.co.jp',
    },
    () => {
      assert.equal(
        appUrl('/api/auth/oauth/callback?code=abc').toString(),
        'https://ai-dojo.akademia.co.jp/api/auth/oauth/callback?code=abc',
      );
      assert.equal(
        normalizeAuthRedirectUrl('https://0.0.0.0:3000/onboarding'),
        'https://ai-dojo.akademia.co.jp/onboarding',
      );
    },
  );
});

test('requires a routable APP_ORIGIN in production', () => {
  withEnvironment({ NODE_ENV: 'production', APP_ORIGIN: undefined }, () => {
    assert.throws(getAppOrigin, /APP_ORIGIN is required/);
  });

  withEnvironment({ NODE_ENV: 'production', APP_ORIGIN: 'https://0.0.0.0:3000' }, () => {
    assert.throws(getAppOrigin, /APP_ORIGIN must be a routable/);
  });
});

test('rejects a mismatched browser Origin without replacing it', () => {
  withEnvironment(
    {
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://ai-dojo.akademia.co.jp',
    },
    () => {
      const invalid = new Request('https://0.0.0.0:3000/api/auth/sign-in', {
        method: 'POST',
        headers: { origin: 'https://attacker.example' },
      });
      assert.throws(
        () => withVerifiedRequestOrigin(invalid),
        /Request Origin does not match APP_ORIGIN/,
      );

      const missing = new Request('https://0.0.0.0:3000/api/auth/sign-in', {
        method: 'POST',
      });
      assert.equal(
        withVerifiedRequestOrigin(missing).headers.get('origin'),
        'https://ai-dojo.akademia.co.jp',
      );
    },
  );
});

test('forwards SDK cookies once without changing security attributes', () => {
  const source = new Headers();
  source.append(
    'set-cookie',
    '__Secure-neon-auth.local.session_challenge=value; Path=/; Secure; HttpOnly; SameSite=None',
  );
  const target = new Headers();

  appendSetCookies(target, source);

  assert.deepEqual(target.getSetCookie(), source.getSetCookie());
});
