'use client';
import { X } from 'lucide-react';
import { SessionInfoPanel } from './SessionInfoPanel';

export function SessionInfoDrawer({ open, onClose, ...panelProps }: { open: boolean; onClose: () => void } & React.ComponentProps<typeof SessionInfoPanel>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xs h-full bg-dojo-surface border-l border-dojo-border shadow-2xl animate-in slide-in-from-right">
        <button onClick={onClose} className="absolute top-3 right-3 text-dojo-text-muted hover:text-dojo-text-primary">
          <X className="h-4 w-4" />
        </button>
        <SessionInfoPanel {...panelProps} />
      </div>
    </div>
  );
}
