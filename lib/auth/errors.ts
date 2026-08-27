export type AuthErrorContext = 'sign-up' | 'sign-in' | 'reset' | 'verify' | 'profile' | 'generic';

type AuthErrorShape = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
};

function asAuthError(err: unknown): AuthErrorShape {
  // Error instances are objects too — keep code/status when present (e.g. AuthApiError).
  if (err && typeof err === 'object') return err as AuthErrorShape;
  if (typeof err === 'string' && err.trim()) return { message: err };
  return {};
}

function normalizeCode(code: unknown, message: string): string {
  if (typeof code === 'string' && code.trim()) {
    return code.trim().toLowerCase().replace(/-/g, '_');
  }

  const lower = message.toLowerCase();
  if (
    lower.includes('already exists') ||
    lower.includes('already registered') ||
    lower.includes('use another email')
  ) {
    return 'user_already_exists';
  }
  if (lower.includes('password too short') || lower.includes('weak password')) {
    return 'weak_password';
  }
  if (lower.includes('invalid email or password') || lower.includes('invalid credentials')) {
    return 'invalid_credentials';
  }
  if (lower.includes('email') && lower.includes('invalid')) {
    return 'invalid_email';
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'network_error';
  }
  if (lower.includes('invalid token') || lower.includes('token expired')) {
    return 'invalid_token';
  }
  return '';
}

function messageForCode(code: string, context: AuthErrorContext): string | null {
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    code.includes('user_already_exists')
  ) {
    if (context === 'sign-up') {
      return 'Please check the information you entered, then try signing in.';
    }
    return 'Unable to complete this request. Try logging in or use a different email.';
  }

  if (code === 'weak_password' || code === 'password_too_short' || code === 'password_too_long') {
    return 'There is a problem with the password length.';
  }

  if (code === 'invalid_credentials' || code === 'invalid_email_or_password') {
    return 'Invalid email or password.';
  }

  if (code === 'invalid_email' || code === 'email_address_invalid') {
    return 'Please enter a valid email address.';
  }

  if (code === 'email_not_confirmed' || code === 'email_not_verified') {
    return 'Please verify your email before continuing.';
  }

  // A reset link is single-use and short-lived, so "invalid" and "expired" are
  // the same thing to the person holding it: the link is spent, get a new one.
  if (
    code === 'invalid_token' ||
    code === 'token_expired' ||
    code === 'invalid_or_expired_token'
  ) {
    return 'This reset link has expired or was already used. Request a new one.';
  }

  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  if (code === 'network_error') {
    return 'Network error. Please try again.';
  }

  // Redirect codes from the OAuth proxy in app/api/auth/[...path]/route.ts.
  // These arrive as `/auth?error=<code>` rather than as a thrown error, and
  // every one of them is an infrastructure failure — never something the
  // person typed — so the copy points at retrying, not at their input.
  if (code === 'init_failed') {
    return 'Could not reach the sign-in provider. Please try again.';
  }

  if (code === 'no_oauth_url') {
    return 'Could not start Google sign-in. Please try again.';
  }

  if (code === 'no_verifier' || code === 'exchange_failed') {
    return 'Sign-in did not complete. Please try again.';
  }

  return null;
}

/**
 * Map Neon/Better Auth errors to safe, user-facing copy.
 * Avoids passing through provider messages that confirm account existence.
 */
export function getAuthErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
  context: AuthErrorContext = 'generic',
): string {
  const { message, code, status } = asAuthError(err);
  const rawMessage = typeof message === 'string' ? message.trim() : '';
  const normalized = normalizeCode(code, rawMessage);

  const mapped = messageForCode(normalized, context);
  if (mapped) return mapped;

  // Status alone is not authoritative for Neon/Better Auth:
  // upstream may return 422 for USER_ALREADY_EXISTS, while the SDK maps
  // generic 422 → validation_failed and treats "already exists" as 409.
  if (context === 'sign-in' && (status === 401 || status === 400)) {
    return 'Invalid email or password.';
  }

  // Do not surface raw provider text for auth UX — it can leak account state.
  return fallback;
}
