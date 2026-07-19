'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AvaturnSDK } from '@avaturn/sdk';
import type { ExportAvatarResult } from '@avaturn/sdk';
import { useAvatar } from '@/lib/auth/avatar-context';

export function AvaturnConnector({
  onClose,
}: {
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<AvaturnSDK | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addAvatar } = useAvatar();

  const init = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      const sdk = new AvaturnSDK();
      sdkRef.current = sdk;

      sdk.on('load', () => setLoading(false));
      sdk.on('export', async (data: ExportAvatarResult) => {
        await addAvatar(data.url, null);
        onClose();
      });
      sdk.on('error', (err) => {
        setError(err.message ?? err.type);
      });

      await sdk.init(containerRef.current, {});
    } catch (e: any) {
      setError(e.message ?? 'Failed to initialize avatar creator');
      setLoading(false);
    }
  }, [addAvatar, onClose]);

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

        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-dojo-surface">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-dojo-accent border-t-transparent" />
              <p className="text-xs text-dojo-text-muted">Loading avatar editor...</p>
            </div>
          </div>
        )}

        <div ref={containerRef} className="flex-1" />
      </div>
    </div>
  );
}
