'use client';

/* ───────────────────────────────────────────────
   The language catalogue.

   Not an `EntityTree`: these rows are keyed by `code` rather than `id`, have no
   parent, and the fields that matter are the ones nothing else in the console
   has — the BCP47 tags and Azure voice ids without which a language cannot be
   spoken or transcribed at all.

   Two independent switches per row, because a language can be something to
   learn, something to be taught in, or both. Deleting is deliberately hard:
   built-in rows refuse (seeding would restore them) and a row anything still
   references refuses with the count, because these columns are plain varchars
   rather than foreign keys — Postgres would not stop it, and every affected
   learner's target language would quietly resolve to whatever sorts first.
   ─────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { EmptyState, Loading, adminFetch, adminInputClass } from '@/components/admin/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';

interface AdminLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  sttBcp47: string;
  ttsBcp47: string;
  azureVoiceFemale: string;
  azureVoiceMale: string;
  hasPhonetic: boolean;
  ttsSupported: boolean;
  greetingGesture: string | null;
  isTargetEnabled: boolean;
  isNativeEnabled: boolean;
  displayOrder: number;
  isBuiltIn: boolean;
  /** Accounts and sessions pointing at this code — what a delete would strand. */
  inUse: number;
}

/** A blank row for the create form. Every required field starts empty so the
 *  server's "Missing: …" list and the disabled button agree. */
const BLANK = {
  code: '',
  name: '',
  nativeName: '',
  flag: '🌐',
  sttBcp47: '',
  ttsBcp47: '',
  azureVoiceFemale: '',
  azureVoiceMale: '',
  hasPhonetic: false,
  ttsSupported: true,
  greetingGesture: '',
  isTargetEnabled: true,
  isNativeEnabled: true,
  displayOrder: '0',
};

type Draft = typeof BLANK;

export function LanguagesPanel({ onError }: { onError: (msg: string) => void }) {
  const [languages, setLanguages] = useState<AdminLanguage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    adminFetch<{ languages: AdminLanguage[] }>('/api/admin/languages')
      .then((data) => { if (!cancelled) setLanguages(data.languages ?? []); })
      .catch((e) => { if (!cancelled) onError(e instanceof Error ? e.message : 'Failed to load languages'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [reloadKey, onError]);

  // Closing the open form belongs to the event that refetches, not to the
  // effect — a synchronous setState in an effect body cascades a render.
  const reload = useCallback(() => {
    setEditingCode(null);
    setAdding(false);
    setReloadKey((n) => n + 1);
  }, []);

  const write = useCallback(
    async (code: string | null, method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
      setBusyCode(code ?? '');
      onError('');
      try {
        await adminFetch('/api/admin/languages', { method, body });
        reload();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setBusyCode(null);
      }
    },
    [onError, reload],
  );

  const remove = useCallback(
    async (lang: AdminLanguage) => {
      if (!window.confirm(`Delete ${lang.name}? Disabling it is reversible; this is not.`)) return;

      setBusyCode(lang.code);
      onError('');
      try {
        await adminFetch('/api/admin/languages', { method: 'DELETE', body: { code: lang.code } });
        reload();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Delete failed');
      } finally {
        setBusyCode(null);
      }
    },
    [onError, reload],
  );

  if (loading) return <Loading />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-dojo-text-muted">
          A language needs its speech tags and both Azure voices before anything can be spoken or
          transcribed in it. Turning one off hides it from every picker without touching the
          accounts already using it — which is why disabling is the reversible move and deleting
          is refused while anything still points at the code.
        </p>
        <Button variant="secondary" size="sm" onClick={() => { setAdding((v) => !v); setEditingCode(null); }}>
          <Plus className="h-3.5 w-3.5" />
          {adding ? 'Cancel' : 'Add language'}
        </Button>
      </div>

      {adding && (
        <LanguageForm
          saving={busyCode === ''}
          onCancel={() => setAdding(false)}
          onSubmit={(body) => write(null, 'POST', body)}
        />
      )}

      {languages.length === 0 ? (
        <EmptyState>No languages are configured.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {languages.map((lang) => (
            <Card key={lang.code} raised className="!p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden className="text-lg leading-none">{lang.flag}</span>
                    <span className="text-base font-bold text-dojo-text-primary">{lang.name}</span>
                    <span className="text-sm text-dojo-text-muted">{lang.nativeName}</span>
                    <span className="font-mono text-xs text-dojo-text-muted">{lang.code}</span>
                    {lang.isBuiltIn && <Badge variant="outline">built-in</Badge>}
                    {!lang.ttsSupported && <Badge variant="default">no speech</Badge>}
                    {lang.inUse > 0 && <Badge variant="accent">in use by {lang.inUse}</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dojo-text-muted">
                    <span>STT {lang.sttBcp47}</span>
                    <span>TTS {lang.ttsBcp47}</span>
                    <span>{lang.azureVoiceFemale}</span>
                    <span>{lang.azureVoiceMale}</span>
                    {lang.hasPhonetic && <span>phonetics</span>}
                    <span>greets with a {lang.greetingGesture ?? 'wave'}</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-3 lg:w-64">
                  <Toggle
                    enabled={lang.isTargetEnabled}
                    onChange={(next) => write(lang.code, 'PATCH', { code: lang.code, isTargetEnabled: next })}
                    label="Offered to learn"
                  />
                  <Toggle
                    enabled={lang.isNativeEnabled}
                    onChange={(next) => write(lang.code, 'PATCH', { code: lang.code, isNativeEnabled: next })}
                    label="Used to explain"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditingCode(editingCode === lang.code ? null : lang.code); setAdding(false); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {editingCode === lang.code ? 'Cancel' : 'Edit'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      aria-label={`Delete ${lang.name}`}
                      disabled={busyCode === lang.code || lang.isBuiltIn || lang.inUse > 0}
                      title={
                        lang.isBuiltIn
                          ? 'Built-in languages can only be disabled — seeding would restore them'
                          : lang.inUse > 0
                            ? `${lang.inUse} account(s) or session(s) still use this language`
                            : 'Delete permanently'
                      }
                      onClick={() => remove(lang)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {editingCode === lang.code && (
                <LanguageForm
                  language={lang}
                  saving={busyCode === lang.code}
                  onCancel={() => setEditingCode(null)}
                  onSubmit={(body) => write(lang.code, 'PATCH', { ...body, code: lang.code })}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Create/edit form.
 *
 * `code` is only editable on create — it is the primary key, and every user,
 * session and enrolment row stores it as a plain string, so renaming one would
 * strand all of them.
 */
function LanguageForm({
  language,
  saving,
  onCancel,
  onSubmit,
}: {
  language?: AdminLanguage;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    language
      ? {
          code: language.code,
          name: language.name,
          nativeName: language.nativeName,
          flag: language.flag,
          sttBcp47: language.sttBcp47,
          ttsBcp47: language.ttsBcp47,
          azureVoiceFemale: language.azureVoiceFemale,
          azureVoiceMale: language.azureVoiceMale,
          hasPhonetic: language.hasPhonetic,
          ttsSupported: language.ttsSupported,
          greetingGesture: language.greetingGesture ?? '',
          isTargetEnabled: language.isTargetEnabled,
          isNativeEnabled: language.isNativeEnabled,
          displayOrder: String(language.displayOrder),
        }
      : { ...BLANK },
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const REQUIRED = ['code', 'name', 'nativeName', 'sttBcp47', 'ttsBcp47', 'azureVoiceFemale', 'azureVoiceMale'] as const;
  const incomplete = REQUIRED.some((key) => !String(draft[key]).trim());

  const id = (key: string) => `lang-${language?.code ?? 'new'}-${key}`;

  const field = (key: keyof Draft, label: string, hint?: string) => (
    <div>
      <label htmlFor={id(key)} className="mb-2 block text-sm text-dojo-text-primary">
        {label}
        {(REQUIRED as readonly string[]).includes(key) && <span className="ml-1 text-dojo-danger">*</span>}
      </label>
      <input
        id={id(key)}
        value={String(draft[key])}
        disabled={key === 'code' && Boolean(language)}
        onChange={(e) => set(key, e.target.value as Draft[typeof key])}
        className={`${adminInputClass} disabled:opacity-50`}
      />
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-dojo-text-muted">{hint}</p>}
    </div>
  );

  return (
    <div className={language ? 'mt-6 border-t border-dojo-border pt-6' : 'rounded-(--radius-md) border border-dojo-border bg-dojo-surface-raised p-5'}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field('code', 'Code', language ? 'Fixed — every account and session stores it.' : 'A language tag: "sw", "pt-br".')}
        {field('name', 'English name')}
        {field('nativeName', 'Native name')}
        {field('flag', 'Flag', 'An emoji, shown in every picker.')}
        {field('sttBcp47', 'STT tag', 'Azure recognizer locale, e.g. sw-KE.')}
        {field('ttsBcp47', 'TTS tag', 'Azure synthesiser locale.')}
        {field('azureVoiceFemale', 'Female voice')}
        {field('azureVoiceMale', 'Male voice')}
        <div>
          <label htmlFor={id('greetingGesture')} className="mb-2 block text-sm text-dojo-text-primary">
            Greeting gesture
          </label>
          <select
            id={id('greetingGesture')}
            value={draft.greetingGesture}
            onChange={(e) => set('greetingGesture', e.target.value)}
            className={adminInputClass}
          >
            <option value="">Wave (default)</option>
            <option value="wave">Wave</option>
            <option value="bow">Bow</option>
          </select>
        </div>
        {field('displayOrder', 'Order')}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Toggle
          enabled={draft.ttsSupported}
          onChange={(next) => set('ttsSupported', next)}
          label="Speech supported"
          description="Off means text only — no voice is synthesised."
        />
        <Toggle
          enabled={draft.hasPhonetic}
          onChange={(next) => set('hasPhonetic', next)}
          label="Has phonetics"
          description="Shows a reading line beside vocabulary, as Japanese does."
        />
        <Toggle
          enabled={draft.isTargetEnabled}
          onChange={(next) => set('isTargetEnabled', next)}
          label="Offered to learn"
        />
        <Toggle
          enabled={draft.isNativeEnabled}
          onChange={(next) => set('isNativeEnabled', next)}
          label="Used to explain"
        />
      </div>

      <div className="mt-6 flex gap-2">
        <Button
          variant="primary"
          loading={saving}
          disabled={saving || incomplete}
          onClick={() =>
            onSubmit({
              ...draft,
              greetingGesture: draft.greetingGesture || null,
              displayOrder: Number(draft.displayOrder) || 0,
            })
          }
        >
          {language ? 'Save changes' : 'Add language'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
