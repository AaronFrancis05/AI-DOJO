/* ───────────────────────────────────────────────
   Settings (Panel 13)
   Tabbed sub-nav: Preferences / Notifications / Privacy
   Also links to Avatar & Character and Subscription pages
   ─────────────────────────────────────────────── */

'use client';

import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { SliderRow } from '@/components/ui/SliderRow';
import { Button } from '@/components/ui/Button';
import { Tabs, type Tab } from '@/components/ui/Tabs';
import { BehaviorModeToggle } from '@/components/ui/BehaviorModeToggle';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { useState } from 'react';
import { type BehaviorMode } from '@/lib/design-tokens';
import { ChevronRight, User, CreditCard, Check, LoaderIcon } from 'lucide-react';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { useUser } from '@/lib/auth/user-context';
import { AvatarSettingsDialog } from '@/components/settings/AvatarSettingsDialog';
import { BillingDialog } from '@/components/settings/BillingDialog';

const tabs: Tab[] = [
  { id: 'preferences', label: 'Preferences' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy', label: 'Privacy' },
];

export default function SettingsPage() {
  usePageTitle('Settings');
  const user = useUser();
  const [difficulty, setDifficulty] = useState(50);
  const [responseSpeed, setResponseSpeed] = useState(70);
  const [defaultMode, setDefaultMode] = useState<BehaviorMode>('standard');
  const [notifications, setNotifications] = useState({
    push: true,
    email: false,
    sessionReminders: true,
    progressReports: true,
    weeklyDigest: false,
  });
  const [targetLanguage, setTargetLanguage] = useState(user?.preferredTargetLanguage ?? 'ja');
  const [nativeLanguage, setNativeLanguage] = useState(user?.nativeLanguage ?? 'en');
  const [languageDirty, setLanguageDirty] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [savedLanguage, setSavedLanguage] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);

  const saveLanguages = async () => {
    setSavingLanguage(true);
    setSavedLanguage(false);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredTargetLanguage: targetLanguage,
          nativeLanguage,
        }),
      });
      if (res.ok) {
        setLanguageDirty(false);
        setSavedLanguage(true);
        setTimeout(() => setSavedLanguage(false), 2500);
      }
    } catch {
      setSavedLanguage(false);
    } finally {
      setSavingLanguage(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-8">
        <h1 className="hidden md:block text-2xl font-bold text-dojo-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          Manage your preferences, account, and subscription
        </p>
      </div>

      {/* Links to sub-sections (opened as dialogue sections) */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setAvatarOpen(true)}
          className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent rounded-[--radius-lg]"
        >
          <Card hoverable>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dojo-accent/10">
                  <User className="h-5 w-5 text-dojo-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-dojo-text-primary">Avatar &amp; Character</p>
                  <p className="text-xs text-dojo-text-muted">Customize your appearance and AI voice preferences</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-dojo-text-muted" />
            </div>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setBillingOpen(true)}
          className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent rounded-[--radius-lg]"
        >
          <Card hoverable>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dojo-accent/10">
                  <CreditCard className="h-5 w-5 text-dojo-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-dojo-text-primary">Subscription</p>
                  <p className="text-xs text-dojo-text-muted">Manage your plan and billing</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-dojo-text-muted" />
            </div>
          </Card>
        </button>
      </div>

      {/* Settings tabs */}
      <Card>
        <Tabs tabs={tabs} renderPanel={(tabId) => {
          switch (tabId) {
            case 'preferences':
              return (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-dojo-text-primary mb-3">Language</h4>
                    <div className="rounded-2xl border border-dojo-border bg-dojo-surface/60 p-5">
                      <LanguagePicker
                        targetLanguage={targetLanguage}
                        nativeLanguage={nativeLanguage}
                        onTargetChange={(code) => {
                          setTargetLanguage(code);
                          setLanguageDirty(true);
                          setSavedLanguage(false);
                        }}
                        onNativeChange={(code) => {
                          setNativeLanguage(code);
                          setLanguageDirty(true);
                          setSavedLanguage(false);
                        }}
                      />
                      <p className="mt-4 text-xs text-dojo-text-muted leading-relaxed">
                        These are your defaults. Courses are language templates, so you can
                        pick a different target or native language on each course card whenever
                        you start a path.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        size="sm"
                        onClick={saveLanguages}
                        disabled={!languageDirty || savingLanguage}
                      >
                        {savingLanguage ? (
                          <LoaderIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          'Save Languages'
                        )}
                      </Button>
                      {savedLanguage && (
                        <span className="flex items-center gap-1.5 text-sm text-dojo-success">
                          <Check className="h-4 w-4" />
                          Saved — your paths are now personalized.
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-dojo-text-primary mb-3">Default Behavior Mode</h4>
                    <BehaviorModeToggle value={defaultMode} onChange={setDefaultMode} />
                  </div>
                  <SliderRow
                    label="Difficulty Level"
                    description="Adjust the complexity of AI responses"
                    value={difficulty}
                    onChange={setDifficulty}
                    showValue
                  />
                  <SliderRow
                    label="Response Speed"
                    description="How long the AI waits before replying"
                    value={responseSpeed}
                    onChange={setResponseSpeed}
                    showValue
                  />

                </div>
              );
            case 'notifications':
              return (
                <div className="space-y-5">
                  <Toggle
                    label="Push Notifications"
                    description="Receive notifications on your device"
                    enabled={notifications.push}
                    onChange={(v) => setNotifications((p) => ({ ...p, push: v }))}
                  />
                  <Toggle
                    label="Email Notifications"
                    description="Get updates via email"
                    enabled={notifications.email}
                    onChange={(v) => setNotifications((p) => ({ ...p, email: v }))}
                  />
                  <Toggle
                    label="Session Reminders"
                    description="Remind you of upcoming practice sessions"
                    enabled={notifications.sessionReminders}
                    onChange={(v) => setNotifications((p) => ({ ...p, sessionReminders: v }))}
                  />
                  <Toggle
                    label="Progress Reports"
                    description="Weekly progress summaries"
                    enabled={notifications.progressReports}
                    onChange={(v) => setNotifications((p) => ({ ...p, progressReports: v }))}
                  />
                  <Toggle
                    label="Weekly Digest"
                    description="A roundup of your learning activity"
                    enabled={notifications.weeklyDigest}
                    onChange={(v) => setNotifications((p) => ({ ...p, weeklyDigest: v }))}
                  />
                </div>
              );
            case 'privacy':
              return (
                <div className="space-y-4">
                  <div className="rounded-xl bg-dojo-surface border border-dojo-border p-4">
                    <h4 className="text-sm font-semibold text-dojo-text-primary mb-2">Data Sharing</h4>
                    <p className="text-xs text-dojo-text-muted mb-3">
                      Allow anonymized data to help improve AI DOJO for everyone.
                    </p>
                    <Toggle
                      label="Share anonymized usage data"
                      enabled={false}
                      onChange={() => {}}
                    />
                  </div>
                  <div className="rounded-xl bg-dojo-surface border border-dojo-border p-4">
                    <h4 className="text-sm font-semibold text-dojo-text-primary mb-2">Account</h4>
                    <p className="text-xs text-dojo-text-muted mb-3">
                      Manage your account settings and data.
                    </p>
                    <div className="flex gap-3">
                      <Button variant="secondary" size="sm">Export Data</Button>
                      <Button variant="danger" size="sm">Delete Account</Button>
                    </div>
                  </div>
                </div>
              );
            default:
              return null;
          }
        }} />
      </Card>

      <AvatarSettingsDialog open={avatarOpen} onClose={() => setAvatarOpen(false)} />
      <BillingDialog open={billingOpen} onClose={() => setBillingOpen(false)} />
    </div>
  );
}
