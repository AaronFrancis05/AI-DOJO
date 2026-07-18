'use client';

import React, { useEffect, useRef, useState } from 'react';

interface AkademiaAvatarViewportProps {
  name: string;
  accentColor: string;
  mode: 'idle' | 'listening' | 'talking';
  emotion?: string;
  gesture?: string;
  cameraMode?: 'front' | 'over-shoulder';
}

export function AkademiaAvatarViewport({
  mode,
  emotion = 'neutral',
  gesture = 'none',
  cameraMode = 'front',
}: AkademiaAvatarViewportProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);

  // 1. Listen for messages FROM the Akademia app
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // SECURITY: Verify the message comes from our domain
      if (event.origin !== 'https://ai-avatar.akademia.co.jp') return;
      
      if (event.data.type === 'AKADEMIA_READY') {
        setIsReady(true);
      }
      
      if (event.data.type === 'USER_SPOKE') {
        // Optional: If you want Dojo to handle the STT backend logic, 
        // you can trigger your handleSend(event.data.text) here.
        console.log('🎤 User spoke to Akademia avatar:', event.data.text);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 2. Send commands TO the Akademia app whenever React props change
  useEffect(() => {
    if (!isReady || !iframeRef.current) return;

    iframeRef.current.contentWindow?.postMessage({
      type: 'UPDATE_AVATAR_STATE',
      payload: { mode, emotion, gesture, cameraMode }
    }, 'https://ai-avatar.akademia.co.jp');
  }, [isReady, mode, emotion, gesture, cameraMode]);

  // The URL pointing to your hosted Akademia app
  const iframeSrc = `https://ai-avatar.akademia.co.jp/?mode=avatar-only&camera=${cameraMode}`;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Loading State */}
      {!isReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-dojo-surface/80 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dojo-accent border-t-transparent" />
        </div>
      )}
      
      {/* The Iframe Bridge */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className="h-full w-full border-none"
        allow="microphone; autoplay; clipboard-write"
        title="Akademia AI Avatar"
        style={{ opacity: isReady ? 1 : 0, transition: 'opacity 0.5s ease' }}
      />
    </div>
  );
}