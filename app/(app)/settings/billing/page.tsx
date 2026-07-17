'use client';

import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-lg p-6 text-center">
      <Link
        href="/settings"
        className="mb-12 inline-flex items-center gap-1 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>

      <div className="mt-16 flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-dojo-accent/10">
          <Clock className="h-8 w-8 text-dojo-accent" />
        </div>
        <h1 className="text-2xl font-bold text-dojo-text-primary">Pricing & Plans</h1>
        <p className="max-w-sm text-sm text-dojo-text-muted leading-relaxed">
          AI Dojo is currently free for all users. Premium plans and billing will be available soon.
        </p>
        <span className="mt-2 inline-flex items-center rounded-full bg-dojo-accent/10 px-4 py-1.5 text-sm font-semibold text-dojo-accent">
          Coming Soon
        </span>
      </div>
    </div>
  );
}
