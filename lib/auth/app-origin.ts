const NON_ROUTABLE_HOSTS = new Set(['0.0.0.0', '::', '[::]']);

function isNonRoutableHost(hostname: string): boolean {
  return NON_ROUTABLE_HOSTS.has(hostname.toLowerCase());
}

function parseAppOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      isNonRoutableHost(url.hostname)
    ) {
      throw new Error('invalid origin');
    }
    return url.origin;
  } catch {
    throw new Error(
      'APP_ORIGIN must be a routable http(s) origin without a path, query, or fragment.',
    );
  }
}

/** The only browser-reachable origin used at the authentication boundary. */
export function getAppOrigin(): string {
  const configured = process.env.APP_ORIGIN;
  if (configured) return parseAppOrigin(configured);

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  throw new Error('APP_ORIGIN is required in production.');
}

/** Builds a browser-facing URL without consulting request or proxy headers. */
export function appUrl(path: string): URL {
  return new URL(path, getAppOrigin());
}

/**
 * Converts relative and non-routable app redirects to APP_ORIGIN while leaving
 * third-party OAuth provider URLs untouched.
 */
export function normalizeAuthRedirectUrl(url: string): string {
  try {
    const origin = getAppOrigin();
    const parsed = new URL(url, origin);
    if (isNonRoutableHost(parsed.hostname)) {
      return new URL(parsed.pathname + parsed.search + parsed.hash, origin).toString();
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Browser POSTs must either declare the configured origin or omit Origin.
 * An omitted Origin is filled with APP_ORIGIN so the SDK never falls back to
 * an internal request URL or an untrusted Referer value.
 */
export function withVerifiedRequestOrigin(request: Request): Request {
  const configuredOrigin = getAppOrigin();
  const requestOrigin = request.headers.get('origin');

  if (requestOrigin && requestOrigin !== configuredOrigin) {
    throw new Error('Request Origin does not match APP_ORIGIN.');
  }

  if (requestOrigin) return request;

  // Origin missing — inject APP_ORIGIN without cloning via `new Request(request, ...)`
  // which throws "Cannot read private member #state" when `request` is a
  // NextRequest (extends Request with private #state). Mutating the existing
  // Headers is safe — Request/NextRequest headers are mutable via `.set()`.
  try {
    request.headers.set('origin', configuredOrigin);
    return request;
  } catch {
    // Fallback for immutable headers (should not happen in Next.js, but be safe):
    // rebuild from URL string, not from the NextRequest instance itself.
    const headers = new Headers(request.headers);
    headers.set('origin', configuredOrigin);
    return new Request(request.url, {
      method: request.method,
      headers,
      // body is null for GET/HEAD; clone via arrayBuffer would be more correct
      // but sign-out is POST with no body, so undefined is fine here.
      body: (request as Request & { body?: BodyInit | null }).body ?? undefined,
      // @ts-expect-error duplex required for Node 18+ when body is a stream
      duplex: 'half',
    });
  }
}
