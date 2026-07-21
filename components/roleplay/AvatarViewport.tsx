'use client';

import React, { useEffect, useRef, useState } from 'react';

interface AvatarViewportProps {
  name: string;
  accentColor: string;
  characterId?: string; 
  mode: 'idle' | 'listening' | 'talking';
  emotion?: string;
  gesture?: string;
  cameraMode?: 'front' | 'over-shoulder';
  textToSpeak?: string; // 🆕 NEW: Receives the AI's response text
}

export function AvatarViewport({
  characterId,
  mode,
  emotion = 'neutral',
  gesture = 'none',
  cameraMode = 'front',
  textToSpeak = '', // 🆕 NEW
}: AvatarViewportProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);

  // 1. Listen for messages FROM the Akademia iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://ai-avatar.akademia.co.jp') return;
      if (event.data.type === 'AKADEMIA_READY') setIsReady(true);
      if (event.data.type === 'USER_SPOKE') console.log('🎤 User spoke:', event.data.text);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 2. Send state updates (idle, listening, talking)
  useEffect(() => {
    if (!isReady || !iframeRef.current) return;
    iframeRef.current.contentWindow?.postMessage({
      type: 'UPDATE_AVATAR_STATE',
      payload: { mode, emotion, gesture, cameraMode },
    }, 'https://ai-avatar.akademia.co.jp');
  }, [isReady, mode, emotion, gesture, cameraMode]);

  // 3. 🆕 NEW: Send text to speak when it changes
  useEffect(() => {
    if (textToSpeak && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'MAKE_AVATAR_SPEAK',
        payload: { 
          text: textToSpeak,
          language: 'en' // Adjust if Dojo uses dynamic languages
        }
      }, 'https://ai-avatar.akademia.co.jp');
    }
  }, [textToSpeak]);

  const characterParam = characterId ? `&characterId=${encodeURIComponent(characterId)}` : '';
  const iframeSrc = `https://ai-avatar.akademia.co.jp/?mode=avatar-only&camera=${cameraMode}${characterParam}`;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {!isReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-dojo-surface/80 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-dojo-accent border-t-transparent" />
        </div>
      )}
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