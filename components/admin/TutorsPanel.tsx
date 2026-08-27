'use client';

/* ───────────────────────────────────────────────
   Tutor verification and profile editing. Approving a tutor is the gate that
   `tutors.verificationStatus` describes in src/schema.ts; editing the profile
   matters because both language sets are what every scheduling route validates
   against, so a wrong one silently blocks the tutor from working at all.
   ─────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { LanguagePillGroup } from '@/components/tutors/LanguagePillGroup';
import { useLanguageCatalog } from '@/lib/language-context';
import { getNativeLangName, getTargetLangConfig } from '@/lib/language';
import { EmptyState, Loading, adminFetch, adminInputClass } from '@/components/admin/shared';
import { Check, GraduationCap, Pencil, X } from 'lucide-react';

interface AdminTutor {
  id: number;
  userId: string;
  headline: string;
  bio: string | null;
  languages: string[];
  instructionLanguages: string[];
  hourlyRateCents: number;
  currency: string;
  timezone: string;
  verificationStatus: string;
  isAcceptingBookings: boolean;
  createdAt: string;
  name: string;
  email: string;
  accountStatus: string;
}

const STATUS_VARIANT: Record<string, 'success' | 'outline' | 'default'> = {
  verified: 'success',
  pending: 'outline',
  rejected: 'default',
};

function formatRate(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(0)} ${currency}/hr`;
}

export function TutorsPanel({ onError }: { onError: (msg: string) => void }) {
  const [tutors, setTutors] = useState<AdminTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ tutors: AdminTutor[] }>('/api/admin/tutors')
      .then((data) => { if (!cancelled) setTutors(data.tutors ?? []); })
      .catch((e) => { if (!cancelled) onError(e instanceof Error ? e.message : 'Failed to load tutors'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey, onError]);

  const patch = useCallback(async (id: number, body: Record<string, unknown>) => {
    setBusyId(id);
    onError('');
    try {
      await adminFetch(`/api/admin/tutors/${id}`, { method: 'PATCH', body });
      setEditingId(null);
      setReloadKey((n) => n + 1);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }, [onError]);

  if (loading) return <Loading />;
  if (tutors.length === 0) return <EmptyState>No tutor applications yet.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      {tutors.map((tutor) => (
        <Card key={tutor.id} raised className="!p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <GraduationCap className="h-4 w-4 shrink-0 text-dojo-accent" />
                <span className="text-base font-bold text-dojo-text-primary">
                  {tutor.name || tutor.email}
                </span>
                <Badge variant={STATUS_VARIANT[tutor.verificationStatus] ?? 'default'}>
                  {tutor.verificationStatus}
                </Badge>
                {tutor.accountStatus !== 'active' && (
                  <Badge variant="default">account {tutor.accountStatus}</Badge>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-dojo-text-primary">{tutor.headline}</p>
              {tutor.bio && (
                <p className="mt-1 text-sm leading-relaxed text-dojo-text-muted">{tutor.bio}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dojo-text-muted">
                <span>{tutor.email}</span>
                <span>Teaches {tutor.languages.map((c) => getTargetLangConfig(c).name).join(', ')}</span>
                <span>Explains in {tutor.instructionLanguages.map((c) => getNativeLangName(c)).join(', ')}</span>
                <span>{formatRate(tutor.hourlyRateCents, tutor.currency)}</span>
                <span>{tutor.timezone}</span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={busyId === tutor.id}
                  disabled={tutor.verificationStatus === 'verified'}
                  onClick={() => patch(tutor.id, { verificationStatus: 'verified' })}
                >
                  <Check className="h-3.5 w-3.5" />
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={busyId === tutor.id}
                  disabled={tutor.verificationStatus === 'rejected'}
                  onClick={() => patch(tutor.id, { verificationStatus: 'rejected' })}
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingId(editingId === tutor.id ? null : tutor.id)}
              >
                <Pencil className="h-3.5 w-3.5" />
                {editingId === tutor.id ? 'Cancel' : 'Edit profile'}
              </Button>
              <Toggle
                enabled={tutor.isAcceptingBookings}
                onChange={(next) => patch(tutor.id, { isAcceptingBookings: next })}
                label="Accepting bookings"
              />
            </div>
          </div>

          {editingId === tutor.id && (
            <TutorEditor
              tutor={tutor}
              saving={busyId === tutor.id}
              onSave={(body) => patch(tutor.id, body)}
            />
          )}
        </Card>
      ))}
    </div>
  );
}

function TutorEditor({
  tutor,
  saving,
  onSave,
}: {
  tutor: AdminTutor;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const catalog = useLanguageCatalog();

  const [headline, setHeadline] = useState(tutor.headline);
  const [bio, setBio] = useState(tutor.bio ?? '');
  const [timezone, setTimezone] = useState(tutor.timezone);
  const [rate, setRate] = useState(String(tutor.hourlyRateCents / 100));
  const [languages, setLanguages] = useState<string[]>(tutor.languages);
  const [instructionLanguages, setInstructionLanguages] = useState<string[]>(tutor.instructionLanguages);

  const toggle = (list: string[], set: (v: string[]) => void) => (code: string) =>
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);

  return (
    <div className="mt-6 border-t border-dojo-border pt-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`hl-${tutor.id}`} className="mb-2 block text-sm text-dojo-text-primary">Headline</label>
          <input id={`hl-${tutor.id}`} value={headline} onChange={(e) => setHeadline(e.target.value)} className={adminInputClass} />
        </div>
        <div>
          <label htmlFor={`tz-${tutor.id}`} className="mb-2 block text-sm text-dojo-text-primary">Timezone</label>
          <input id={`tz-${tutor.id}`} value={timezone} onChange={(e) => setTimezone(e.target.value)} className={adminInputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`bio-${tutor.id}`} className="mb-2 block text-sm text-dojo-text-primary">Bio</label>
          <textarea id={`bio-${tutor.id}`} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} className={`${adminInputClass} resize-y leading-relaxed`} />
        </div>
        <div>
          <label htmlFor={`rate-${tutor.id}`} className="mb-2 block text-sm text-dojo-text-primary">
            Hourly rate ({tutor.currency})
          </label>
          <input id={`rate-${tutor.id}`} type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className={adminInputClass} />
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <LanguagePillGroup
          label="Languages they teach"
          hint="The target language a learner practises. Every class they schedule is checked against this."
          options={catalog.target}
          selected={languages}
          onToggle={toggle(languages, setLanguages)}
        />
        <LanguagePillGroup
          label="Languages they explain in"
          hint="How they coach and give feedback. They pick one of these per class."
          options={catalog.native}
          selected={instructionLanguages}
          onToggle={toggle(instructionLanguages, setInstructionLanguages)}
        />
      </div>

      <Button
        variant="primary"
        className="mt-6"
        loading={saving}
        disabled={saving}
        onClick={() =>
          onSave({
            headline,
            bio: bio.trim() || null,
            timezone,
            hourlyRateCents: Math.round(Number(rate) * 100),
            languages,
            instructionLanguages,
          })
        }
      >
        Save profile
      </Button>
    </div>
  );
}
