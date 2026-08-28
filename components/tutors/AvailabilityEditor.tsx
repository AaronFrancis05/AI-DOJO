/* ───────────────────────────────────────────────
   AvailabilityEditor — the tutor's weekly bookable hours.
   Backed by GET/PUT /api/tutor/availability, which replaces the whole
   pattern in one transaction (see the route's comment for why).

   Shared by the teaching console and the tutor onboarding wizard, so the
   hours a tutor sets during setup and the ones they edit later are the same
   editor against the same endpoint.
   ─────────────────────────────────────────────── */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { Plus, Trash2 } from 'lucide-react';

export interface AvailabilitySlot {
  id?: number;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

interface AvailabilityEditorProps {
  /** Called after a successful save. The wizard advances on it; the console
   *  leaves the tutor where they are. */
  onSaved?: () => void;
  saveLabel?: string;
}

export function AvailabilityEditor({ onSaved, saveLabel }: AvailabilityEditorProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [accepting, setAccepting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retrying, setRetrying] = useState(false);

  // A failed GET used to fall through to an empty schedule, which is
  // indistinguishable from a tutor who has set no hours — and pressing Save on
  // it would have replaced their real availability with nothing, since PUT
  // rewrites the whole pattern. Track the failure instead and edit nothing.
  const load = useCallback(
    () =>
      fetch('/api/tutor/availability', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) {
            setLoadError(data.error ?? 'Could not load your availability.');
            return;
          }
          setLoadError('');
          setSlots(data.slots as AvailabilitySlot[]);
          setTimezone(data.timezone ?? 'UTC');
          setAccepting(Boolean(data.isAcceptingBookings));
        })
        .catch(() => setLoadError('Could not load your availability.')),
    [],
  );

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!slots) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/tutor/availability', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slots, isAcceptingBookings: accepting }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not save.');
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [slots, accepting, onSaved]);

  if (loadError) {
    return (
      <Card className="!p-5">
        <h3 className="text-sm font-bold text-dojo-text-primary">Weekly availability</h3>
        <p className="mt-1 text-sm leading-relaxed text-dojo-danger">{loadError}</p>
        <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
          Your existing hours are untouched. Editing is disabled until they load.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          loading={retrying}
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            void load().finally(() => setRetrying(false));
          }}
        >
          Try again
        </Button>
      </Card>
    );
  }

  if (!slots) {
    return (
      <Card className="animate-pulse !p-5">
        <div className="h-32 rounded bg-dojo-surface-raised" />
      </Card>
    );
  }

  const update = (index: number, patch: Partial<AvailabilitySlot>) => {
    setSlots((prev) => (prev ?? []).map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setSaved(false);
  };

  return (
    <Card className="!p-5">
      <h3 className="text-sm font-bold text-dojo-text-primary">Weekly availability</h3>
      <p className="mt-1 text-xs leading-relaxed text-dojo-text-muted">
        Times are in <span className="font-medium text-dojo-text-primary">{timezone}</span>, your
        profile timezone. Learners see them converted to their own.
      </p>

      <div className="mt-4">
        <Toggle
          enabled={accepting}
          onChange={(v) => { setAccepting(v); setSaved(false); }}
          label="Accepting bookings"
          description="Off hides you from the tutor list without deleting your schedule."
        />
      </div>

      <div className="mt-4 space-y-2">
        {slots.length === 0 && (
          <p className="text-sm text-dojo-text-muted">
            No hours set. Learners can&apos;t book you until there are some.
          </p>
        )}
        {slots.map((slot, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              value={slot.dayOfWeek}
              onChange={(e) => update(index, { dayOfWeek: Number(e.target.value) })}
              aria-label="Day"
              className="rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary focus:border-dojo-accent focus:outline-none"
            >
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
            <input
              type="time"
              value={minutesToTime(slot.startMinute)}
              onChange={(e) => update(index, { startMinute: timeToMinutes(e.target.value) })}
              aria-label="Start time"
              className="rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary focus:border-dojo-accent focus:outline-none"
            />
            <span className="text-sm text-dojo-text-muted">to</span>
            <input
              type="time"
              value={minutesToTime(slot.endMinute)}
              onChange={(e) => update(index, { endMinute: timeToMinutes(e.target.value) })}
              aria-label="End time"
              className="rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-4 py-2 text-sm text-dojo-text-primary focus:border-dojo-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                setSlots((prev) => (prev ?? []).filter((_, i) => i !== index));
                setSaved(false);
              }}
              aria-label="Remove slot"
              className="rounded-(--radius-md) p-2 text-dojo-text-muted transition-colors hover:text-dojo-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-dojo-danger">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setSlots((prev) => [...(prev ?? []), { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 10 * 60 }]);
            setSaved(false);
          }}
        >
          <Plus className="h-4 w-4" /> Add hours
        </Button>
        <Button variant="primary" loading={saving} disabled={saving} onClick={save}>
          {saveLabel ?? (saved ? 'Saved — update' : 'Save availability')}
        </Button>
      </div>
    </Card>
  );
}
