'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

interface CalendarEvent {
  id: number;
  title: string;
  date: string;
  time?: string;
  type: 'practice' | 'review' | 'session';
}

export default function CalendarPage() {
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(body => {
        if (body.success && Array.isArray(body.sessions)) {
          const mapped: CalendarEvent[] = body.sessions.map((s: any) => {
            const d = s.startedAt ? new Date(s.startedAt) : new Date();
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return {
              id: s.id,
              title: s.scenarioTitle ?? 'Practice Session',
              date: dateStr,
              time: timeStr,
              type: s.status === 'active' ? 'practice' as const : 'session' as const,
            };
          });
          setEvents(mapped);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
        <h1 className="text-2xl font-bold text-dojo-text-primary">Calendar</h1>
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
              const isToday = dateStr === selectedDate;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`relative aspect-square rounded-lg p-1.5 text-sm transition-colors
                    ${isToday ? 'bg-dojo-accent text-white' : 'text-dojo-text-primary hover:bg-dojo-surface'}
                  `}
                >
                  <span className="font-medium">{day}</span>
                  {dayEvents.length > 0 && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {dayEvents.slice(0, 3).map((ev, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full ${
                            ev.type === 'session' ? 'bg-dojo-success' : 'bg-dojo-accent'
                          } ${isToday ? 'bg-white' : ''}`}
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
            {new Date(selectedDate).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h3>
          {loading ? (
            <p className="text-sm text-dojo-text-muted text-center py-8 animate-pulse">
              Loading events...
            </p>
          ) : selectedEvents.length === 0 ? (
            <p className="text-sm text-dojo-text-muted text-center py-8">
              No events for this day
            </p>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-lg bg-dojo-surface-raised p-3">
                  <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full
                    ${event.type === 'practice' ? 'bg-dojo-accent/10' : ''}
                    ${event.type === 'session' ? 'bg-dojo-success/10' : ''}
                    ${event.type === 'review' ? 'bg-dojo-warning/10' : ''}
                  `}>
                    <Clock className={`h-4 w-4
                      ${event.type === 'practice' ? 'text-dojo-accent' : ''}
                      ${event.type === 'session' ? 'text-dojo-success' : ''}
                      ${event.type === 'review' ? 'text-dojo-warning' : ''}
                    `} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-dojo-text-primary">{event.title}</p>
                    {event.time && (
                      <p className="text-xs text-dojo-text-muted mt-0.5">{event.time}</p>
                    )}
                    <Badge variant={event.type === 'session' ? 'accent' : 'default'} className="mt-1.5 capitalize">
                      {event.type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
