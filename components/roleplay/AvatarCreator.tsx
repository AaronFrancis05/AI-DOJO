'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AvaturnSDK } from '@avaturn/sdk';
import type { ExportAvatarResult } from '@avaturn/sdk';

const AVATURN_MODEL_KEY = 'ai-dojo-avaturn-model';

export function getStoredAvatarUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AVATURN_MODEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.url === 'string') return parsed.url;
    return null;
  } catch { return null; }
}

export function clearStoredAvatar(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AVATURN_MODEL_KEY);
}

export function AvatarCreator({
  onExport,
  onClose,
}: {
  onExport: (result: ExportAvatarResult) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<AvaturnSDK | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const init = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      const sdk = new AvaturnSDK();
      sdkRef.current = sdk;

      sdk.on('load', () => setLoading(false));
      sdk.on('export', (data) => {
        localStorage.setItem(AVATURN_MODEL_KEY, JSON.stringify({
          url: data.url,
          urlType: data.urlType,
          avatarId: data.avatarId,
          sessionId: data.sessionId,
        }));
        onExport(data);
      });
      sdk.on('error', (err) => {
        setError(err.message ?? err.type);
      });

      await sdk.init(containerRef.current, {});
    } catch (e: any) {
      setError(e.message ?? 'Failed to initialize avatar creator');
      setLoading(false);
    }
  }, [onExport]);

  useEffect(() => {
    init();
    return () => {
      sdkRef.current?.destroy();
      sdkRef.current = null;
    };
  }, [init]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative flex h-[90vh] w-[90vw] max-w-5xl flex-col rounded-xl bg-dojo-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dojo-border px-4 py-3 shrink-0">
          <h2 className="text-sm font-semibold text-dojo-text-primary">Create Your Avatar</h2>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-dojo-danger">{error}</span>}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-dojo-border text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-dojo-surface">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-dojo-accent border-t-transparent" />
              <p className="text-xs text-dojo-text-muted">Loading avatar editor...</p>
            </div>
          </div>
        )}

        {/* Avaturn iframe container */}
        <div ref={containerRef} className="flex-1" />
      </div>
    </div>
  );
}
