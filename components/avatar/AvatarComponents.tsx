'use client';

import { useEffect, useRef, useState } from 'react';
import { ensureAvatarScriptInjected } from '@/lib/avatar/avatarScript';
import ChatHistoryOverlay from '@/components/avatar/ChatHistoryOverlay';


interface AvatarComponentsProps {
  backend?: string;
  appId?: string;
  userId?: string;
  instance?: string;
  settingsGroup?: string;
  avatarScale?: number | string;
  avatarVerticalOffset?: number | string;
  scriptUrl?: string;
  className?: string;
}

const DEFAULT_SCRIPT = 'https://ai-avatar-ui-ghost.vercel.app/ai-avatar-ui.js';
const DEFAULT_BACKEND = '/api/avatar';

export default function AvatarComponents({
  backend = DEFAULT_BACKEND,
  appId,
  userId,
  instance = 'default',
  settingsGroup,
  avatarScale = 1,
  avatarVerticalOffset = -1.25,
  scriptUrl = DEFAULT_SCRIPT,
  className,
}: AvatarComponentsProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    function nudgeResize() {
      window.dispatchEvent(new Event('resize'));
    }

    ensureAvatarScriptInjected(scriptUrl, appId ?? 'ai-dojo')
      .then(() => {
        if (cancelled) return;
        setTimeout(nudgeResize, 50);
        setTimeout(nudgeResize, 400);
      })
      .catch((error) => {
        console.error('[avatar-components] failed to load avatar script:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [scriptUrl, appId]);

  useEffect(() => {
    const reveal = () => {
      shellRef.current
        ?.querySelectorAll('avatar-model, avatar-status, avatar-settings, avatar-captions, avatar-inputs')
        .forEach((el) => el.classList.add('avatar-app-ready'));
    };

    const onAppReady = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.instance || detail.instance === instance) reveal();
    };

    window.addEventListener('avatar:app:ready', onAppReady);

    const pollId = window.setInterval(() => {
      const model = shellRef.current?.querySelector('avatar-model') as any;
      if (model?.currentAvatarModel) {
        reveal();
        window.clearInterval(pollId);
      }
    }, 300);

    const pollTimeout = window.setTimeout(() => {
      window.clearInterval(pollId);
      reveal();
    }, 6000);

    return () => {
      window.removeEventListener('avatar:app:ready', onAppReady);
      window.clearInterval(pollId);
      window.clearTimeout(pollTimeout);
    };
  }, [instance]);

  return (
    <>
      <div className={['flex-1 min-h-0 flex flex-col overflow-hidden', className].filter(Boolean).join(' ')}>
        <div key={instance} ref={shellRef} className="relative w-full flex-1 min-h-0">
          <avatar-model
            backend={backend}
            app-id={appId}
            settings-scope="app"
            settings-group={settingsGroup}
            instance={instance}
            avatar-scale={String(avatarScale)}
            avatar-vertical-offset={String(avatarVerticalOffset)}
            className="h-full"
          />

          <avatar-status
            instance={instance}
            app-id={appId}
            user-id={userId}
            backend={backend}
            className="absolute top-3 left-3 z-10"
          />

          <div className="absolute top-4 right-4 z-10 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              aria-label="View chat history"
              title="Chat history"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 border border-white/20 text-white hover:bg-black/60 active:scale-95 transition-all duration-150 ease-out cursor-pointer"
            >
              <svg className="w-7 h-7 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v5h5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l4 2" />
              </svg>
            </button>

            <avatar-settings
              instance={instance}
              app-id={appId}
              settings-scope="app"
              settings-group={settingsGroup}
              backend={backend}
              className="hidden"
            />
          </div>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-full max-w-xl px-3 flex flex-col">
            <avatar-captions instance={instance} />
            <avatar-inputs instance={instance} backend={backend} />
          </div>
        </div>
      </div>

      <ChatHistoryOverlay
        open={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        instance={instance}
      />
    </>
  );
}