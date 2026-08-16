'use client';

import { useEffect, useState } from 'react';
import { useAvatarScript } from '@/lib/avatar/avatarScript';

const PROFILE_EVENT = 'avatar:update-profile';
const REQUEST_EVENT = 'avatar:request-current-profile';
const INITIAL_WAIT_MS = 2500;
const TIMEOUT_MS = 6000;

export type AvatarProfile = {
  name: string | null;
  persona: string | null;
  thumbnail: string | null;
  raw: unknown;
};

export type ProfileStatus = 'loading' | 'ok' | 'timeout';

const NAME_KEYS = ['name', 'displayName', 'avatarName', 'label'];
const PERSONA_KEYS = ['persona', 'description', 'bio', 'tagline'];
const THUMBNAIL_KEYS = [
  'thumbnail',
  'thumbnailUrl',
  'image',
  'imageUrl',
  'preview',
  'previewUrl',
  'avatarThumbnail',
];

function firstStringField(
  obj: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim().length > 0) return val;
  }
  return null;
}

export function useAvatarProfile(
  instance: string
): { profile: AvatarProfile | null; status: ProfileStatus } {
  const scriptLoaded = useAvatarScript();
  const [profile, setProfile] = useState<AvatarProfile | null>(null);
  const [status, setStatus] = useState<ProfileStatus>('loading');

  useEffect(() => {
    if (!scriptLoaded) return;

    let gotProfile = false;

    function handleProfile(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (typeof detail !== 'object' || detail === null) return;
      const obj = detail as Record<string, unknown>;

      if ('instance' in obj && obj.instance !== instance) return;

      gotProfile = true;
      setProfile({
        name: firstStringField(obj, NAME_KEYS),
        persona: firstStringField(obj, PERSONA_KEYS),
        thumbnail: firstStringField(obj, THUMBNAIL_KEYS),
        raw: detail,
      });
      setStatus('ok');
    }

    window.addEventListener(PROFILE_EVENT, handleProfile as EventListener);

    const requestTimer = setTimeout(() => {
      if (gotProfile) return;
      window.dispatchEvent(
        new CustomEvent(REQUEST_EVENT, { detail: { instance } })
      );
    }, INITIAL_WAIT_MS);

    const timeout = setTimeout(() => {
      setStatus((cur) => (cur === 'loading' ? 'timeout' : cur));
    }, TIMEOUT_MS);

    return () => {
      window.removeEventListener(PROFILE_EVENT, handleProfile as EventListener);
      clearTimeout(requestTimer);
      clearTimeout(timeout);
    };
  }, [scriptLoaded, instance]);

  return { profile, status };
}