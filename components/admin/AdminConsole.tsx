/* ───────────────────────────────────────────────
   Admin console — the seven surfaces an operator runs the product from.

   The console is a shell and nothing else: it owns the tab set and the one
   error banner every panel reports into, and each panel talks to its own
   `/api/admin/*` route. All of those re-check `requireRole('admin')`, so what
   is rendered here is convenience, never access control.
   ─────────────────────────────────────────────── */

'use client';

import { useState } from 'react';
import { Tabs } from '@/components/ui/Tabs';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { AlertCircleIcon } from '@/components/Icons';
import { OverviewPanel } from '@/components/admin/OverviewPanel';
import { UsersPanel } from '@/components/admin/UsersPanel';
import { TutorsPanel } from '@/components/admin/TutorsPanel';
import { CoursesPanel } from '@/components/admin/CoursesPanel';
import { CurriculumPanel } from '@/components/admin/CurriculumPanel';
import { CataloguePanel } from '@/components/admin/CataloguePanel';
import { LanguagesPanel } from '@/components/admin/LanguagesPanel';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'tutors', label: 'Tutors' },
  { id: 'courses', label: 'Courses' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'languages', label: 'Languages' },
];

export function AdminConsole() {
  usePageTitle('Admin');
  const [error, setError] = useState('');

  return (
    <div className="mx-auto w-full max-w-7xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="hidden md:block text-3xl font-bold tracking-tight leading-none text-dojo-text-primary">
          Admin
        </h1>
        <p className="mt-2 text-base leading-relaxed text-dojo-text-muted">
          Accounts and access, tutor verification, and every piece of content learners can reach.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-center gap-2 rounded-lg border border-dojo-danger/30 bg-dojo-danger/10 px-3 py-2.5 text-sm text-dojo-danger"
        >
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Tabs
        tabs={TABS}
        // Switching tabs clears the banner: an error raised by the panel being
        // left behind reads as a failure of the one being opened.
        onChange={() => setError('')}
        renderPanel={(tab) => (
          <div className="pt-6">
            {tab === 'overview' && <OverviewPanel onError={setError} />}
            {tab === 'users' && <UsersPanel onError={setError} />}
            {tab === 'tutors' && <TutorsPanel onError={setError} />}
            {tab === 'courses' && <CoursesPanel onError={setError} />}
            {tab === 'curriculum' && <CurriculumPanel onError={setError} />}
            {tab === 'catalogue' && <CataloguePanel onError={setError} />}
            {tab === 'languages' && <LanguagesPanel onError={setError} />}
          </div>
        )}
      />
    </div>
  );
}
