/* Calendar (Panel 12) — Coming soon. No calendar_events table exists yet. */

'use client';

import { Card } from '@/components/ui/Card';
import { Calendar } from 'lucide-react';

export default function CalendarPage() {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Calendar</h1>
        <p className="text-sm text-dojo-text-muted mt-1">Schedule your practice sessions</p>
      </div>

      <Card className="flex flex-col items-center justify-center py-16">
        <Calendar className="h-12 w-12 text-dojo-text-muted mb-4" />
        <p className="text-sm text-dojo-text-primary font-semibold">Coming Soon</p>
        <p className="text-xs text-dojo-text-muted mt-1 max-w-xs text-center">
          Calendar events will appear here once a calendar_events table and creation flow are built.
        </p>
      </Card>
    </div>
  );
}
