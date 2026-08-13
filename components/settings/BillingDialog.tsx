/* ───────────────────────────────────────────────
   BillingDialog — pricing & plans as a dialogue section
   over /settings (was a page route).
   ─────────────────────────────────────────────── */

'use client';

import { Dialog } from '@/components/ui/Dialog';
import { Clock } from 'lucide-react';

interface BillingDialogProps {
  open: boolean;
  onClose: () => void;
}

export function BillingDialog({ open, onClose }: BillingDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Pricing & Plans" label="Pricing & Plans">
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dojo-accent/10">
          <Clock className="h-8 w-8 text-dojo-accent" />
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-dojo-text-muted">
          AI Dojo is currently free for all users. Premium plans and billing will be available soon.
        </p>
        <span className="inline-flex items-center rounded-full bg-dojo-accent/10 px-4 py-1.5 text-sm font-semibold text-dojo-accent">
          Coming Soon
        </span>
      </div>
    </Dialog>
  );
}
