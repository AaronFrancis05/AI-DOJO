'use client';

import { useEffect, useRef, useState } from 'react';
import { ensureAvatarScriptInjected } from '@/lib/avatar/avatarScript';


interface AvatarSettingsOnlyProps {
  instance: string;
  appId?: string;
  userId?: string;
  backend?: string;
  settingsGroup?: string;
}

export default function AvatarSettingsOnly({
  instance,
  appId = 'ai-dojo',
  userId,
  backend,
  settingsGroup,
}: AvatarSettingsOnlyProps) {
  const [scriptReady, setScriptReady] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

useEffect(() => {
  let cancelled = false;

  ensureAvatarScriptInjected(undefined, appId)
    .then(() => {
      if (cancelled) return;
      setScriptReady(true);
    })
    .catch((error) => {
      console.error('[avatar-settings] failed to load avatar script:', error);
    });

  return () => {
    cancelled = true;
  };
}, [appId, instance]);

  useEffect(() => {
    function reveal() {
      wrapperRef.current
        ?.querySelectorAll('avatar-settings')
        .forEach((el) => el.classList.add('avatar-app-ready'));
    }

    function onAppReady(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail?.instance || detail.instance === instance) reveal();
    }

    window.addEventListener('avatar:app:ready', onAppReady);
    if (scriptReady) reveal();

    return () => {
      window.removeEventListener('avatar:app:ready', onAppReady);
    };
  }, [instance, scriptReady]);

  return (
    // key={instance} forces a full unmount/remount of <avatar-settings>
    // whenever `instance` changes — same reasoning as AvatarComponents.tsx.
    // Without it, an instance change is just an attribute update in place,
    // and this custom element has no attributeChangedCallback to react to
    // that, so it would keep running against the old instance.
    <div key={instance} ref={wrapperRef} className="block">
      <avatar-settings
        instance={instance}
        app-id={appId}
        settings-scope="app"
        settings-group={settingsGroup}
        backend={backend}
        className={`block ${process.env.NEXT_PUBLIC_SHOW_DEV_CONTROLS === "true" ? "" : "hidden"}`}
      />
    </div>
  );
}