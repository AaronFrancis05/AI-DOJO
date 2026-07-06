'use client';
import { createAuthClient } from '@neondatabase/auth';
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters';

export const authClient = createAuthClient('', {
  adapter: BetterAuthReactAdapter({
    sessionOptions: { refetchOnWindowFocus: false },
  }),
});
