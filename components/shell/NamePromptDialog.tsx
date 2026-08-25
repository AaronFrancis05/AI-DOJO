'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';

/**
 * One-time gate for accounts without a display name (never had one, or a row
 * stamped by the legacy 'Learner' fallback). Saving writes the name to Neon
 * Auth via updateUser; the next layout render syncs it into users.name via
 * lib/auth/sync-user.ts — one mechanism, both stores. Intentionally not
 * dismissible: an unnamed account must never render under a placeholder.
 */
export function NamePromptDialog() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    const { error: authError } = await authClient.updateUser({ name: trimmed });
    if (authError) {
      setError('Could not save your name — please try again.');
      setSaving(false);
      return;
    }
    // Layout re-runs on refresh, syncUser persists the name, and this gate
    // unmounts because resolveDisplayName() then returns the real name.
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Set your display name"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-dojo-border bg-dojo-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-dojo-text-primary">What should we call you?</h2>
        <p className="mt-1 text-sm text-dojo-text-muted leading-relaxed">
          Your name is how AI-Dojo greets you and addresses you in sessions. You can change it later in your profile.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <input
            type="text"
            autoFocus
            required
            placeholder="Alex Kim"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-dojo-border bg-dojo-surface-raised px-4 py-2 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
          />
          {error && <p className="text-sm text-dojo-danger">{error}</p>}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full rounded-lg bg-dojo-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save name'}
          </button>
        </form>
      </div>
    </div>
  );
}
