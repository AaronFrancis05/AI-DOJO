'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ChevronLeft, ChevronRight, Clock, Check, Plus, Video, GraduationCap, ClipboardCheck, BookOpen, ListTodo } from 'lucide-react';
import { usePageTitle } from '@/lib/hooks/PageTitleContext';
import { cn } from '@/lib/design-tokens';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

type EventKind = 'task' | 'lesson_reminder' | 'session' | 'booking' | 'class' | 'assessment';

interface CalendarEvent {
  id: string;
  kind: EventKind;
  title: string;
  subtitle?: string;
  date: string;
  time?: string;
  href?: string;
  completed?: boolean;
}

const KIND_META: Record<EventKind, { label: string; dot: string; icon: React.ComponentType<{ className?: string }> }> = {
  task:            { label: 'To-do',      dot: 'bg-dojo-accent',     icon: ListTodo },
  lesson_reminder: { label: 'Lesson',     dot: 'bg-dojo-icebreaker', icon: BookOpen },
  session:         { label: 'Practice',   dot: 'bg-dojo-success',    icon: Clock },
  booking:         { label: '1:1',        dot: 'bg-dojo-warning',    icon: Video },
  class:           { label: 'Class',      dot: 'bg-dojo-streak',     icon: GraduationCap },
  assessment:      { label: 'Evaluation', dot: 'bg-dojo-evaluation', icon: ClipboardCheck },
};

interface CalendarApiItem {
  id: string;
  kind: EventKind;
  title: string;
  subtitle?: string | null;
  at: string;
  allDay?: boolean;
  href?: string | null;
  completed?: boolean;
}

/**
 * Which grid cell an item belongs in.
 *
 * A timed item (a class, a booking, a practice session) is a real instant, so
 * it lands on the day it happens in the viewer's own zone. An all-day item is
 * a calendar date, not an instant: it is stored at UTC midnight, so reading it
 * back in local time would push it onto the previous day for every viewer west
 * of UTC. Those are bucketed by their UTC date, which is the date that was
 * meant.
 */
function toDateStr(iso: string, allDay: boolean): { date: string; time: string } {
  const d = new Date(iso);
  const date = allDay
    ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

export default function CalendarPage() {
  usePageTitle('Calendar');
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);

  // A month either side of the one on screen, so the grid's leading and
  // trailing days are covered and stepping through months stays warm.
  const load = useCallback(() => {
    const from = new Date(Date.UTC(currentYear, currentMonth - 1, 1)).toISOString();
    const to = new Date(Date.UTC(currentYear, currentMonth + 2, 0, 23, 59, 59, 999)).toISOString();
    return fetch(`/api/calendar?from=${from}&to=${to}`, { credentials: 'include' })
      .then(r => r.json())
      .then(body => {
        if (body.success && Array.isArray(body.items)) {
          const mapped: CalendarEvent[] = (body.items as CalendarApiItem[]).map((it) => {
            const { date, time } = toDateStr(it.at, Boolean(it.allDay));
            return {
              id: it.id,
              kind: it.kind as EventKind,
              title: it.title,
              subtitle: it.subtitle ?? undefined,
              date,
              time: it.allDay ? undefined : time,
              href: it.href ?? undefined,
              completed: Boolean(it.completed),
            };
          });
          setEvents(mapped);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentYear, currentMonth]);

  useEffect(() => { void load(); }, [load]);

  const toggleTodo = useCallback(async (event: CalendarEvent) => {
    // `task-12` / `lesson_reminder-12` — the row id is the last segment.
    const idStr = event.id.split('-').pop();
    const nextStatus = event.completed ? 'pending' : 'done';
    const completed = nextStatus === 'done';

    // Flip immediately so the tick feels instant, then reconcile against what
    // the server actually stored. The reconcile is not redundant: an in-flight
    // refetch can land between the two and would otherwise leave the row
    // showing its pre-click state even though the write succeeded.
    setEvents(prev => prev.map(e => (e.id === event.id ? { ...e, completed } : e)));
    try {
      const res = await fetch(`/api/calendar/tasks/${idStr}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error('patch failed');
      setEvents(prev => prev.map(e => (e.id === event.id ? { ...e, completed } : e)));
    } catch {
      setEvents(prev => prev.map(e => (e.id === event.id ? { ...e, completed: event.completed } : e)));
    }
  }, []);

  const addTodo = useCallback(async () => {
    const title = newTodoTitle.trim();
    if (!title) return;
    setAddingTodo(true);
    try {
      const res = await fetch('/api/calendar/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        // UTC midnight, matching how the lesson-plan seeder writes an all-day
        // row — so the to-do comes back on the day it was added on, whatever
        // zone the viewer is in.
        body: JSON.stringify({ title, dueAt: `${selectedDate}T00:00:00.000Z`, allDay: true }),
      });
      if (res.ok) {
        setNewTodoTitle('');
        await load();
      }
    } finally {
      setAddingTodo(false);
    }
  }, [newTodoTitle, selectedDate, load]);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const getEventsForDate = (dateStr: string) =>
    events.filter((e) => e.date === dateStr);

  const selectedEvents = getEventsForDate(selectedDate);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="hidden md:block text-2xl font-bold text-dojo-text-primary">Calendar</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={prevMonth}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h3 className="text-lg font-semibold text-dojo-text-primary">
              {MONTHS[currentMonth]} {currentYear}
            </h3>
            <Button variant="ghost" size="sm" onClick={nextMonth}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-dojo-text-muted py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square p-1" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = getEventsForDate(dateStr);
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`relative aspect-square rounded-lg p-1.5 text-sm transition-colors
                    ${isSelected ? 'bg-dojo-accent text-white' : 'text-dojo-text-primary hover:bg-dojo-surface'}
                  `}
                >
                  <span className="font-medium">{day}</span>
                  {dayEvents.length > 0 && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {dayEvents.slice(0, 3).map((ev, i) => (
                        <span
                          key={i}
                          className={cn('h-1.5 w-1.5 rounded-full', KIND_META[ev.kind].dot, isSelected && 'bg-white')}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-dojo-text-primary mb-4">
            {new Date(selectedDate).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </h3>
          {loading ? (
            <p className="text-sm text-dojo-text-muted text-center py-8 animate-pulse">
              Loading events...
            </p>
          ) : selectedEvents.length === 0 ? (
            <p className="text-sm text-dojo-text-muted text-center py-4">
              No events for this day
            </p>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((event) => {
                const meta = KIND_META[event.kind];
                const Icon = meta.icon;
                const isTodo = event.kind === 'task' || event.kind === 'lesson_reminder';

                const details = (
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium text-dojo-text-primary', event.completed && 'line-through text-dojo-text-muted')}>
                      {event.title}
                    </p>
                    {(event.time || event.subtitle) && (
                      <p className="text-xs text-dojo-text-muted mt-0.5">
                        {[event.time, event.subtitle].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <Badge variant="outline" className={cn('mt-1.5', meta.dot.replace('bg-', 'border-'), meta.dot.replace('bg-', 'text-'))}>
                      {meta.label}
                    </Badge>
                  </div>
                );

                // The checkbox is a SIBLING of the link, never inside it: a
                // <button> nested in an <a> is invalid nesting, and clicking one
                // makes the router re-render the route, which refetches and
                // overwrites the optimistic tick before the PATCH lands.
                return (
                  <div key={event.id} className="flex items-start gap-3 rounded-lg bg-dojo-surface-raised p-3">
                    {isTodo ? (
                      <button
                        type="button"
                        onClick={() => void toggleTodo(event)}
                        aria-label={event.completed ? 'Mark as not done' : 'Mark as done'}
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                          event.completed
                            ? 'border-dojo-success bg-dojo-success/10 text-dojo-success'
                            : 'border-dojo-border text-dojo-text-muted hover:border-dojo-accent hover:text-dojo-accent',
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', `${meta.dot}/10`)}>
                        <Icon className={cn('h-4 w-4', meta.dot.replace('bg-', 'text-'))} />
                      </div>
                    )}
                    {event.href ? (
                      <Link href={event.href} className="flex min-w-0 flex-1">
                        {details}
                      </Link>
                    ) : (
                      details
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 border-t border-dojo-border pt-4">
            <input
              value={newTodoTitle}
              onChange={(e) => setNewTodoTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addTodo(); }}
              placeholder="Add a to-do for this day"
              maxLength={160}
              className="w-full rounded-(--radius-md) border border-dojo-border bg-dojo-surface px-3 py-2 text-sm text-dojo-text-primary placeholder:text-dojo-text-muted focus:border-dojo-accent focus:outline-none"
            />
            <Button variant="secondary" size="sm" disabled={addingTodo || !newTodoTitle.trim()} onClick={() => void addTodo()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
