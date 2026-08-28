import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appUrl,
  getAppOrigin,
  normalizeAuthRedirectUrl,
  withVerifiedRequestOrigin,
} from './app-origin';
import {
  appendSetCookies,
  SESSION_DATA_COOKIE,
  SESSION_TOKEN_COOKIE,
} from './cookies';

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

test('preserves abort signal when rebuilding request without Origin', () => {
  const env = process.env as Record<string, string | undefined>;
  const prev = {
    NODE_ENV: env.NODE_ENV,
    APP_ORIGIN: env.APP_ORIGIN,
  };
  env.NODE_ENV = 'production';
  env.APP_ORIGIN = 'https://ai-dojo.akademia.co.jp';
  try {
    // Force the fallback branch by making headers.set throw.
    const controller = new AbortController();
    const req = new Request('https://0.0.0.0:3000/api/auth/sign-out', {
      method: 'POST',
      signal: controller.signal,
    });
    Object.defineProperty(req, 'headers', {
      value: new Proxy(req.headers, {
        get(target, prop) {
          if (prop === 'set') throw new Error('immutable');
          const v = (target as unknown as Record<string, unknown>)[prop as string];
          return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
        },
      }),
      configurable: true,
    });
    const rebuilt = withVerifiedRequestOrigin(req);
    assert.equal(rebuilt.signal.aborted, false);
    controller.abort();
    assert.equal(rebuilt.signal.aborted, true);
    assert.equal(rebuilt.headers.get('origin'), 'https://ai-dojo.akademia.co.jp');
  } finally {
    if (prev.NODE_ENV === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = prev.NODE_ENV;
    if (prev.APP_ORIGIN === undefined) delete env.APP_ORIGIN;
    else env.APP_ORIGIN = prev.APP_ORIGIN;
  }
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

test('session cookie names carry the SDK __Secure- prefix', () => {
  // The SDK mints every cookie with `secure: true` behind NEON_AUTH_COOKIE_PREFIX,
  // and `cookies().get()` matches names exactly. An unprefixed spelling reads as
  // undefined forever, which is how the session_token fallback in
  // getAuthUserReadOnly went dead without a single error being logged.
  assert.equal(SESSION_TOKEN_COOKIE, '__Secure-neon-auth.session_token');
  assert.equal(SESSION_DATA_COOKIE, '__Secure-neon-auth.local.session_data');
});
