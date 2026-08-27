'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TutorProfile {
  id: number;
  headline: string;
  bio: string | null;
  /** Target languages this tutor teaches. */
  languages: string[];
  /** Native languages this tutor can explain in. */
  instructionLanguages: string[];
  hourlyRateCents: number;
  currency: string;
  timezone: string;
  verificationStatus: string;
  isAcceptingBookings: boolean;
}

/**
 * The signed-in tutor's own profile, from `GET /api/tutor/profile`.
 *
 * The scheduling forms need it before they can render: both language pickers
 * are constrained to what this tutor actually holds, so offering the whole
 * catalogue would let them schedule a class the API then refuses.
 */
export function useTutorProfile(): {
  profile: TutorProfile | null;
  loading: boolean;
  error: string;
  reload: () => void;
} {
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // `loading` is not set here: it starts true, and `reload()` sets it from an
    // event handler. Setting it synchronously in the effect body would be a
    // cascading render for a value that is already correct.
    fetch('/api/tutor/profile', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.profile) setProfile(data.profile as TutorProfile);
        else setError(typeof data?.error === 'string' ? data.error : 'Could not load your profile.');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your profile.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    setReloadKey((n) => n + 1);
  }, []);

  return { profile, loading, error, reload };
}
