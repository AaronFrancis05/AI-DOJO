/* Messages (Panel 11) — Coming soon. No messaging/threads schema exists yet. */

'use client';

import { Card } from '@/components/ui/Card';
import { MessageSquare } from 'lucide-react';

export default function MessagesPage() {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Messages</h1>
        <p className="text-sm text-dojo-text-muted mt-1">Talk with other learners and AI assistants</p>
      </div>

      <Card className="flex flex-col items-center justify-center py-16">
        <MessageSquare className="h-12 w-12 text-dojo-text-muted mb-4" />
        <p className="text-sm text-dojo-text-primary font-semibold">Coming Soon</p>
        <p className="text-xs text-dojo-text-muted mt-1 max-w-xs text-center">
          Messaging is not yet built — no threads or messages schema exists.
        </p>
      </Card>
    </div>
  );
}
