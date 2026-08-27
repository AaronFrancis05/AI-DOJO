'use client';

/* ───────────────────────────────────────────────
   The publish board: which courses learners can see.

   Deliberately the only place `courses.isActive` is written. The Curriculum tab
   edits the same rows' structure and content, but publishing is the decision an
   admin comes here to make — and a control that exists in two places is a
   control nobody trusts. `EntityTree`'s archive toggle is therefore left off
   the course level there.
   ─────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { EmptyState, Loading, adminFetch } from '@/components/admin/shared';
import type { SkillLevel } from '@/lib/design-tokens';

interface AdminCourse {
  id: number;
  slug: string;
  title: string;
  description: string;
  difficulty: string;
  isActive: boolean;
  displayOrder: number;
}

export function CoursesPanel({ onError }: { onError: (msg: string) => void }) {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ courses: AdminCourse[] }>('/api/admin/courses')
      .then((data) => { if (!cancelled) setCourses(data.courses ?? []); })
      .catch((e) => { if (!cancelled) onError(e instanceof Error ? e.message : 'Failed to load courses'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onError]);

  const toggle = useCallback(
    async (course: AdminCourse, isActive: boolean) => {
      setBusyId(course.id);
      onError('');
      try {
        await adminFetch('/api/admin/courses', {
          method: 'PATCH',
          body: { courseId: course.id, isActive },
        });
        setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, isActive } : c)));
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Update failed');
      } finally {
        setBusyId(null);
      }
    },
    [onError],
  );

  if (loading) return <Loading />;
  if (courses.length === 0) {
    return <EmptyState>No courses have been created yet — add one on the Curriculum tab.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      {courses.map((course) => (
        <Card key={course.id} raised className="!p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-dojo-text-primary">{course.title}</span>
                <Badge variant={course.difficulty as SkillLevel}>{course.difficulty}</Badge>
                {!course.isActive && <Badge variant="outline">hidden</Badge>}
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-dojo-text-muted">
                {course.description}
              </p>
              <p className="mt-2 font-mono text-xs text-dojo-text-muted">/courses/{course.slug}</p>
            </div>
            <div className="shrink-0">
              <Toggle
                enabled={course.isActive}
                onChange={(next) => toggle(course, next)}
                label="Published"
                description={busyId === course.id ? 'Saving…' : 'Visible to learners'}
              />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
